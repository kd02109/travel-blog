import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { basename, resolve } from "node:path";
import { createAppEnvironment } from "./environment.mjs";
import { run } from "./process.mjs";
const root = fileURLToPath(new URL("../", import.meta.url));
const app = basename(process.cwd());
const [command, ...args] = process.argv.slice(2);
try {
  if (!["dev", "build", "start"].includes(command))
    throw new Error("dev, build 또는 start 명령이 필요합니다.");
  const mode =
    process.env.TRAVEL_API_MODE ?? (command === "dev" ? "mock" : "supabase");
  if (mode === "mock" && command !== "dev")
    throw new Error(
      "MirageJS는 개발 환경에서만 실행됩니다. 운영 빌드는 build:supabase를 사용하세요.",
    );
  const env = createAppEnvironment({ root, app, mode });
  env.NODE_ENV = command === "dev" ? "development" : "production";
  const require = createRequire(resolve(root, "apps", app, "package.json"));
  console.log(
    `[${app}] ${mode === "mock" ? "MOCK · 실제 서비스 연결 없음" : "SUPABASE · 실제 SaaS 연결"}`,
  );
  process.exitCode = await run(
    process.execPath,
    [require.resolve("next/dist/bin/next"), command, ...args],
    { env },
  );
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
