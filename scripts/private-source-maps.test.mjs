import { afterEach, test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  archivePublicSourceMaps,
  assertNoPublicSourceMaps,
  lookupArchivedSource,
  scrubPublicSourceMaps,
  validateArchiveTarget,
  withIsolatedBuildDirectory,
} from "./private-source-maps.mjs";

const temporaryRoots = [];
const repositoryRoot = fileURLToPath(new URL("../", import.meta.url));
afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "travel-private-maps-"));
  temporaryRoots.push(root);
  const repo = join(root, "repo");
  const staticDir = join(repo, "apps", "web", ".next", "static");
  const archiveBase = join(root, "private-archive");
  mkdirSync(staticDir, { recursive: true });
  return { root, repo, staticDir, archiveBase };
}

test("fails closed for missing, in-repository, and ephemeral Vercel archive targets", async () => {
  const { repo, root } = fixture();
  await assert.rejects(
    validateArchiveTarget({ archiveBase: "", repositoryRoot: repo }),
    /absolute path/,
  );
  await assert.rejects(
    validateArchiveTarget({
      archiveBase: join(repo, "maps"),
      repositoryRoot: repo,
    }),
    /inside the repository/,
  );
  await assert.rejects(
    validateArchiveTarget({
      archiveBase: join(root, "archive"),
      repositoryRoot: repo,
      vercel: true,
    }),
    /ephemeral/,
  );
  symlinkSync(repo, join(root, "linked-repo"));
  await assert.rejects(
    validateArchiveTarget({
      archiveBase: join(root, "linked-repo", "maps"),
      repositoryRoot: repo,
    }),
    /resolves inside the repository/,
  );
});

test("archives maps by app, release, and build ID, then leaves no public map or reference", async () => {
  const { repo, staticDir, archiveBase } = fixture();
  const chunks = join(staticDir, "chunks");
  mkdirSync(chunks);
  const javascript = join(chunks, "app.js");
  const css = join(chunks, "style.css");
  writeFileSync(
    javascript,
    "const note = '//# sourceMappingURL=not-a-comment';\nconsole.log(note);\n//# sourceMappingURL=app.js.map",
  );
  writeFileSync(
    join(chunks, "app.js.map"),
    '{"sourcesContent":["private source"]}',
  );
  writeFileSync(css, "body{color:red}/*# sourceMappingURL=style.css.map */");
  writeFileSync(
    join(chunks, "style.css.map"),
    '{"sourcesContent":["private css"]}',
  );
  const target = await validateArchiveTarget({
    archiveBase,
    repositoryRoot: repo,
  });
  const archived = await archivePublicSourceMaps({
    staticDir,
    archiveBase: target,
    app: "web",
    release: "commit-a1b2c3",
    buildId: "build-4",
  });
  assert.equal(archived.manifest.files.length, 2);
  assert.equal(archived.manifest.release, "commit-a1b2c3");
  assert.equal(
    readFileSync(join(archived.directory, "chunks", "app.js.map"), "utf8"),
    '{"sourcesContent":["private source"]}',
  );
  assert.equal(
    readFileSync(join(archived.directory, "chunks", "style.css.map"), "utf8"),
    '{"sourcesContent":["private css"]}',
  );
  assert.ok(existsSync(join(archived.directory, "manifest.json")));
  await scrubPublicSourceMaps(staticDir);
  await assertNoPublicSourceMaps(staticDir);
  assert.equal(existsSync(join(chunks, "app.js.map")), false);
  assert.equal(existsSync(join(chunks, "style.css.map")), false);
  assert.match(readFileSync(javascript, "utf8"), /not-a-comment/);
  assert.doesNotMatch(
    readFileSync(javascript, "utf8"),
    /sourceMappingURL=app\.js\.map/,
  );
  assert.doesNotMatch(readFileSync(css, "utf8"), /sourceMappingURL/);
  await assert.rejects(
    archivePublicSourceMaps({
      staticDir,
      archiveBase: target,
      app: "web",
      release: "commit-a1b2c3",
      buildId: "build-4",
    }),
    /no browser source maps/,
  );
});

test("detects surviving map references and rejects missing generated maps", async () => {
  const { repo, staticDir, archiveBase } = fixture();
  const target = await validateArchiveTarget({
    archiveBase,
    repositoryRoot: repo,
  });
  const javascript = join(staticDir, "app.js");
  writeFileSync(
    javascript,
    "console.log('ready');\n//# sourceMappingURL=app.js.map",
  );
  await assert.rejects(
    assertNoPublicSourceMaps(staticDir),
    /reference remains/,
  );
  await assert.rejects(
    archivePublicSourceMaps({
      staticDir,
      archiveBase: target,
      app: "web",
      release: "a1b2c3",
      buildId: "build-4",
    }),
    /no browser source maps/,
  );
  await scrubPublicSourceMaps(staticDir);
  await assertNoPublicSourceMaps(staticDir);
});

test("the build wrapper refuses a missing archive target before starting Next.js", () => {
  const script = join(
    dirname(fileURLToPath(import.meta.url)),
    "build-private-source-maps.mjs",
  );
  const result = spawnSync(process.execPath, [script], {
    cwd: join(repositoryRoot, "apps", "web"),
    env: { ...process.env, TRAVEL_SOURCE_MAP_ARCHIVE_DIR: "", VERCEL: "" },
    encoding: "utf8",
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /TRAVEL_SOURCE_MAP_ARCHIVE_DIR/);
  assert.doesNotMatch(result.stdout, /Next\.js/);
});

test("an isolated build failure removes only its temporary output and preserves the original error", async () => {
  const { repo } = fixture();
  const appRoot = join(repo, "apps", "web");
  const existingBuild = join(appRoot, ".next", "static", "keep.js");
  writeFileSync(existingBuild, "existing server output");
  const originalError = new Error("build failed");
  let isolatedDir;
  await assert.rejects(
    withIsolatedBuildDirectory(appRoot, async (directory) => {
      isolatedDir = directory;
      writeFileSync(join(directory, "partial.map"), "private map");
      throw originalError;
    }),
    (error) => error === originalError,
  );
  assert.equal(existsSync(isolatedDir), false);
  assert.equal(readFileSync(existingBuild, "utf8"), "existing server output");
});

test("normal web and admin builds keep public browser maps disabled", () => {
  for (const app of ["web", "admin"]) {
    const result = spawnSync(
      process.execPath,
      [
        "--input-type=module",
        "--eval",
        "import config from './next.config.js'; if (config.productionBrowserSourceMaps !== false) process.exit(1)",
      ],
      {
        cwd: join(repositoryRoot, "apps", app),
        env: { ...process.env, TRAVEL_PRIVATE_SOURCE_MAP_BUILD: "" },
        encoding: "utf8",
      },
    );
    assert.equal(result.status, 0, `${app}: ${result.stderr}`);
  }
});

test("the opt-in flag alone cannot enable maps outside an isolated build directory", () => {
  for (const app of ["web", "admin"]) {
    const result = spawnSync(
      process.execPath,
      [
        "--input-type=module",
        "--eval",
        "import config from './next.config.js'; if (config.productionBrowserSourceMaps !== false) process.exit(1)",
      ],
      {
        cwd: join(repositoryRoot, "apps", app),
        env: {
          ...process.env,
          TRAVEL_PRIVATE_SOURCE_MAP_BUILD: "1",
          TRAVEL_NEXT_DIST_DIR: ".next",
          VERCEL: "",
        },
        encoding: "utf8",
      },
    );
    assert.equal(result.status, 0, `${app}: ${result.stderr}`);
  }
});

test("a local isolated archive build may enable browser maps", () => {
  const result = spawnSync(
    process.execPath,
    [
      "--input-type=module",
      "--eval",
      "import config from './next.config.js'; if (config.productionBrowserSourceMaps !== true) process.exit(1)",
    ],
    {
      cwd: join(repositoryRoot, "apps", "web"),
      env: {
        ...process.env,
        TRAVEL_PRIVATE_SOURCE_MAP_BUILD: "1",
        TRAVEL_NEXT_DIST_DIR: ".next-test-private-maps-abc123",
        VERCEL: "",
      },
      encoding: "utf8",
    },
  );
  assert.equal(result.status, 0, result.stderr);
});

test("Vercel config guard disables maps even if the opt-in flag is set", () => {
  for (const app of ["web", "admin"]) {
    const result = spawnSync(
      process.execPath,
      [
        "--input-type=module",
        "--eval",
        "import config from './next.config.js'; if (config.productionBrowserSourceMaps !== false) process.exit(1)",
      ],
      {
        cwd: join(repositoryRoot, "apps", app),
        env: {
          ...process.env,
          TRAVEL_PRIVATE_SOURCE_MAP_BUILD: "1",
          VERCEL: "1",
        },
        encoding: "utf8",
      },
    );
    assert.equal(result.status, 0, `${app}: ${result.stderr}`);
  }
});

test("the wrapper rejects Vercel before creating an isolated build directory", () => {
  const { root } = fixture();
  const appRoot = join(repositoryRoot, "apps", "web");
  const temporaryBuilds = () =>
    readdirSync(appRoot).filter((entry) =>
      entry.startsWith(".next-test-private-maps-"),
    );
  const before = temporaryBuilds();
  const result = spawnSync(
    process.execPath,
    [join(repositoryRoot, "scripts", "build-private-source-maps.mjs")],
    {
      cwd: appRoot,
      env: {
        ...process.env,
        TRAVEL_SOURCE_MAP_ARCHIVE_DIR: join(root, "archive"),
        VERCEL: "1",
      },
      encoding: "utf8",
    },
  );
  assert.equal(result.status, 1);
  assert.match(result.stderr, /ephemeral/);
  assert.deepEqual(temporaryBuilds(), before);
});

test("offline lookup maps a sanitized frame using one verified archived build", async () => {
  const { repo, staticDir, archiveBase } = fixture();
  const chunks = join(staticDir, "chunks");
  mkdirSync(chunks);
  const map = {
    version: 3,
    file: "app.js",
    sources: ["src/app.ts"],
    sourcesContent: ["throw new Error('example')"],
    names: [],
    // Generated 2:5 resolves to original 3:7, verifying 1-based stack positions.
    mappings: ";IAEM",
  };
  writeFileSync(join(chunks, "app.js.map"), JSON.stringify(map));
  const target = await validateArchiveTarget({
    archiveBase,
    repositoryRoot: repo,
  });
  const archived = await archivePublicSourceMaps({
    staticDir,
    archiveBase: target,
    app: "web",
    release: "commit-test",
    buildId: "build-test",
  });
  const result = await lookupArchivedSource({
    archiveDir: archived.directory,
    file: "_next/static/chunks/app.js",
    line: 2,
    column: 5,
  });
  assert.equal(result.release, "commit-test");
  assert.deepEqual(result.original, {
    file: "src/app.ts",
    line: 3,
    column: 7,
    name: undefined,
  });
  const cli = spawnSync(
    process.execPath,
    [
      join(repositoryRoot, "scripts", "lookup-private-source-map.mjs"),
      archived.directory,
      "chunks/app.js",
      "2",
      "5",
    ],
    { encoding: "utf8" },
  );
  assert.equal(cli.status, 0, cli.stderr);
  assert.equal(JSON.parse(cli.stdout).original.file, "src/app.ts");
  await assert.rejects(
    lookupArchivedSource({
      archiveDir: archived.directory,
      file: "chunks/app.js",
      line: 2,
      column: 4,
    }),
    /No original source location/,
  );
  await assert.rejects(
    lookupArchivedSource({
      archiveDir: archived.directory,
      file: "../private.js",
      line: 1,
      column: 1,
    }),
    /relative static JavaScript/,
  );
  writeFileSync(join(archived.directory, "chunks", "app.js.map"), "tampered");
  await assert.rejects(
    lookupArchivedSource({
      archiveDir: archived.directory,
      file: "chunks/app.js",
      line: 1,
      column: 1,
    }),
    /does not match its manifest/,
  );
});
