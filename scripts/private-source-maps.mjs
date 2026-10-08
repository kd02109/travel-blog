import { createHash, randomUUID } from "node:crypto";
import { SourceMap } from "node:module";
import {
  chmod,
  copyFile,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  realpath,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { isAbsolute, join, relative, resolve, sep } from "node:path";

const identifier = /^[a-zA-Z0-9._-]{1,128}$/;
const sourceMapComment =
  /(?:^|\r?\n)\/\/[#@]\s*sourceMappingURL=[^\r\n]*|\/\*[#@]\s*sourceMappingURL=[\s\S]*?\*\//g;

function isWithin(parent, child) {
  const path = relative(parent, child);
  return path === "" || (!path.startsWith(`..${sep}`) && path !== "..");
}

export function assertMapIdentifier(value, name) {
  if (!identifier.test(value ?? "") || value === "." || value === "..") {
    throw new Error(
      `${name} must contain only letters, digits, dots, hyphens, or underscores.`,
    );
  }
  return value;
}

export async function validateArchiveTarget({
  archiveBase,
  repositoryRoot,
  vercel = false,
}) {
  if (vercel) {
    throw new Error(
      "Vercel build storage is ephemeral. Configure a durable private uploader before enabling browser source maps there.",
    );
  }
  if (!archiveBase || !isAbsolute(archiveBase)) {
    throw new Error(
      "TRAVEL_SOURCE_MAP_ARCHIVE_DIR must be an absolute path outside the repository.",
    );
  }
  const repository = await realpath(repositoryRoot);
  const target = resolve(archiveBase);
  if (isWithin(repository, target)) {
    throw new Error(
      "Private source maps cannot be archived inside the repository or deployment output.",
    );
  }
  await mkdir(target, { recursive: true, mode: 0o700 });
  const actual = await realpath(target);
  if (isWithin(repository, actual)) {
    throw new Error(
      "Private source map archive resolves inside the repository.",
    );
  }
  return actual;
}

export async function withIsolatedBuildDirectory(
  appRoot,
  work,
  onCleanupError,
) {
  const temporaryDir = await mkdtemp(
    resolve(appRoot, ".next-test-private-maps-"),
  );
  let result;
  let originalError;
  try {
    result = await work(temporaryDir);
  } catch (error) {
    originalError = error;
  }
  try {
    await rm(temporaryDir, { recursive: true, force: true });
  } catch (cleanupError) {
    if (originalError) {
      onCleanupError?.(cleanupError);
    } else {
      originalError = cleanupError;
    }
  }
  if (originalError) throw originalError;
  return result;
}

async function walkFiles(directory, prefix = "") {
  const entries = await readdir(join(directory, prefix), {
    withFileTypes: true,
  });
  const files = [];
  for (const entry of entries) {
    const path = join(prefix, entry.name);
    if (entry.isSymbolicLink()) {
      throw new Error(`Unexpected symlink in public build output: ${path}`);
    }
    if (entry.isDirectory()) files.push(...(await walkFiles(directory, path)));
    else if (entry.isFile()) files.push(path);
  }
  return files;
}

async function privateDirectory(path) {
  await mkdir(path, { recursive: true, mode: 0o700 });
  const info = await lstat(path);
  if (!info.isDirectory() || info.mode & 0o077) {
    throw new Error(
      `Private archive directory has unsafe permissions: ${path}`,
    );
  }
}

export async function archivePublicSourceMaps({
  staticDir,
  archiveBase,
  app,
  release,
  buildId,
}) {
  assertMapIdentifier(app, "app");
  assertMapIdentifier(release, "release");
  assertMapIdentifier(buildId, "buildId");
  const maps = (await walkFiles(staticDir)).filter((path) =>
    path.endsWith(".map"),
  );
  if (maps.length === 0) {
    throw new Error(
      "The production build generated no browser source maps; archive is incomplete.",
    );
  }
  const appDir = join(archiveBase, app);
  const releaseDir = join(appDir, release);
  await privateDirectory(appDir);
  await privateDirectory(releaseDir);
  const finalDir = join(releaseDir, buildId);
  try {
    await stat(finalDir);
    throw new Error(
      `A private source map archive already exists for ${app}/${release}/${buildId}.`,
    );
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  const temporaryDir = join(releaseDir, `.upload-${randomUUID()}`);
  await privateDirectory(temporaryDir);
  const entries = [];
  try {
    for (const path of maps) {
      const destination = join(temporaryDir, path);
      const parts = path.split(sep);
      let parent = temporaryDir;
      for (const part of parts.slice(0, -1)) {
        parent = join(parent, part);
        await privateDirectory(parent);
      }
      await copyFile(join(staticDir, path), destination);
      const content = await readFile(destination);
      await chmod(destination, 0o600);
      entries.push({
        path,
        bytes: content.length,
        sha256: createHash("sha256").update(content).digest("hex"),
      });
    }
    const manifest = {
      app,
      release,
      buildId,
      createdAt: new Date().toISOString(),
      files: entries,
    };
    await writeFile(
      join(temporaryDir, "manifest.json"),
      JSON.stringify(manifest, null, 2),
      {
        mode: 0o600,
        flag: "wx",
      },
    );
    await rename(temporaryDir, finalDir);
    return { directory: finalDir, manifest };
  } catch (error) {
    await rm(temporaryDir, { recursive: true, force: true });
    throw error;
  }
}

export async function scrubPublicSourceMaps(staticDir) {
  let files;
  try {
    files = await walkFiles(staticDir);
  } catch (error) {
    if (error.code === "ENOENT") return;
    throw error;
  }
  for (const path of files) {
    const absolute = join(staticDir, path);
    if (path.endsWith(".map")) {
      await rm(absolute);
      continue;
    }
    if (!/\.(?:js|mjs|css)$/.test(path)) continue;
    const content = await readFile(absolute, "utf8");
    const cleaned = content.replace(sourceMapComment, "");
    if (cleaned !== content) await writeFile(absolute, cleaned);
  }
}

export async function assertNoPublicSourceMaps(staticDir) {
  const files = await walkFiles(staticDir);
  for (const path of files) {
    if (path.endsWith(".map")) {
      throw new Error(`Public source map remains in build output: ${path}`);
    }
    if (!/\.(?:js|mjs|css)$/.test(path)) continue;
    const content = await readFile(join(staticDir, path), "utf8");
    if (sourceMapComment.test(content)) {
      sourceMapComment.lastIndex = 0;
      throw new Error(`Source map reference remains in build output: ${path}`);
    }
    sourceMapComment.lastIndex = 0;
  }
}

export async function lookupArchivedSource({ archiveDir, file, line, column }) {
  if (!archiveDir || !isAbsolute(archiveDir)) {
    throw new Error(
      "Provide the absolute path to one exact archived build directory.",
    );
  }
  const asset =
    typeof file === "string" ? file.replace(/^\/?_next\/static\//, "") : file;
  if (
    typeof asset !== "string" ||
    asset.length > 512 ||
    !asset.endsWith(".js") ||
    asset.includes("\\") ||
    asset.includes(":") ||
    asset.includes("?") ||
    asset.includes("#") ||
    asset.includes("\0") ||
    asset.split("/").some((part) => !part || part === "." || part === "..")
  ) {
    throw new Error(
      "Provide a relative static JavaScript asset, such as chunks/app.js.",
    );
  }
  if (
    !Number.isSafeInteger(line) ||
    line < 1 ||
    !Number.isSafeInteger(column) ||
    column < 1
  ) {
    throw new Error(
      "Generated line and column must be positive 1-based integers.",
    );
  }
  const archive = resolve(archiveDir);
  const mapFile = `${asset}.map`;
  const manifest = JSON.parse(
    await readFile(join(archive, "manifest.json"), "utf8"),
  );
  const entry = manifest.files?.find((candidate) => candidate.path === mapFile);
  if (!entry) {
    throw new Error(`No archived map for ${asset} in this exact build.`);
  }
  const mapPath = resolve(archive, mapFile);
  if (!isWithin(archive, mapPath) || !(await lstat(mapPath)).isFile()) {
    throw new Error("Archived map path is invalid.");
  }
  const contents = await readFile(mapPath);
  const digest = createHash("sha256").update(contents).digest("hex");
  if (digest !== entry.sha256 || contents.length !== entry.bytes) {
    throw new Error(
      "Archived map does not match its manifest; lookup refused.",
    );
  }
  const origin = new SourceMap(
    JSON.parse(contents.toString("utf8")),
  ).findOrigin(line, column);
  if (!origin.fileName) {
    throw new Error(
      `No original source location for ${asset}:${line}:${column}.`,
    );
  }
  return {
    app: manifest.app,
    release: manifest.release,
    buildId: manifest.buildId,
    generated: { file: asset, line, column },
    original: {
      file: origin.fileName,
      line: origin.lineNumber,
      column: origin.columnNumber,
      name: origin.name,
    },
  };
}
