import { readFile } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createAppEnvironment } from "./environment.mjs";
import { run } from "./process.mjs";
import {
  archivePublicSourceMaps,
  assertMapIdentifier,
  assertNoPublicSourceMaps,
  scrubPublicSourceMaps,
  validateArchiveTarget,
  withIsolatedBuildDirectory,
} from "./private-source-maps.mjs";

const repositoryRoot = fileURLToPath(new URL("../", import.meta.url));
const appRoot = process.cwd();
const app = basename(appRoot);

try {
  if (!["web", "admin"].includes(app)) {
    throw new Error("Run this command from apps/web or apps/admin.");
  }
  const archiveBase = await validateArchiveTarget({
    archiveBase: process.env.TRAVEL_SOURCE_MAP_ARCHIVE_DIR,
    repositoryRoot,
    vercel: Boolean(process.env.VERCEL),
  });
  const profile = createAppEnvironment({
    root: repositoryRoot,
    app,
    mode: "supabase",
  });
  const release = assertMapIdentifier(
    process.env.NEXT_PUBLIC_APP_RELEASE ||
      process.env.VERCEL_GIT_COMMIT_SHA ||
      profile.NEXT_PUBLIC_APP_RELEASE,
    "release",
  );
  // Next dev/build instances may already be using .next. Keep this opt-in
  // archive build fully isolated and discard its output after archiving.
  const archived = await withIsolatedBuildDirectory(
    appRoot,
    async (temporaryDist) => {
      const distDir = basename(temporaryDist);
      const staticDir = resolve(temporaryDist, "static");
      const code = await run(
        process.execPath,
        [fileURLToPath(new URL("./run-app.mjs", import.meta.url)), "build"],
        {
          cwd: appRoot,
          env: {
            ...process.env,
            NEXT_PUBLIC_APP_RELEASE: release,
            TRAVEL_PRIVATE_SOURCE_MAP_BUILD: "1",
            TRAVEL_NEXT_DIST_DIR: distDir,
          },
        },
      );
      if (code !== 0)
        throw new Error(`Next.js build exited with code ${code}.`);
      const buildId = assertMapIdentifier(
        (await readFile(resolve(temporaryDist, "BUILD_ID"), "utf8")).trim(),
        "buildId",
      );
      const archive = await archivePublicSourceMaps({
        staticDir,
        archiveBase,
        app,
        release,
        buildId,
      });
      // This isolated output is verified, then discarded. A later deployment
      // build is not guaranteed to match these maps.
      await scrubPublicSourceMaps(staticDir);
      await assertNoPublicSourceMaps(staticDir);
      return archive;
    },
    (cleanupError) =>
      console.error(
        `Temporary build cleanup also failed: ${cleanupError.message}`,
      ),
  );
  console.log(
    `[${app}] Archived ${archived.manifest.files.length} browser source maps for ${release} outside the deployment output: ${archived.directory}`,
  );
  console.log(
    `[${app}] This archive applies only to the isolated build above; it may not match a later Vercel build of the same release.`,
  );
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
