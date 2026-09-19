import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { APP_PORTS, createAppEnvironment } from "./environment.mjs";
import { run } from "./process.mjs";
const root = fileURLToPath(new URL("../", import.meta.url));
const [mode, command, ...args] = process.argv.slice(2);
try {
  if (!["dev", "build", "start"].includes(command))
    throw new Error("지원하지 않는 실행 명령입니다.");
  if (mode === "mock" && command !== "dev")
    throw new Error("Mock은 dev에서만 지원합니다.");
  // Validate both apps before launching either one. Never print credentials.
  for (const app of Object.keys(APP_PORTS))
    createAppEnvironment({ root, app, mode });
  const require = createRequire(import.meta.url);
  const task = command === "dev" ? "dev" : `${command}:supabase`;
  process.exitCode = await run(
    process.execPath,
    [require.resolve("turbo/bin/turbo"), "run", task, ...args],
    {
      cwd: root,
      env: {
        ...process.env,
        NODE_ENV: command === "dev" ? "development" : "production",
        TRAVEL_API_MODE: mode,
        NEXT_PUBLIC_API_MOCKING: mode === "mock" ? "enabled" : "disabled",
      },
    },
  );
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
