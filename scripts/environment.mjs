import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseEnv } from "node:util";
export const APP_PORTS = { web: 3000, admin: 3002 };
export function readProfileFile(path) {
  return existsSync(path) ? parseEnv(readFileSync(path, "utf8")) : {};
}
export function assertSupabaseEnvironment(env, app) {
  const missing = [
    "NEXT_PUBLIC_SUPABASE_URL",
    "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  ].filter((key) => !env[key]?.trim());
  if (missing.length)
    throw new Error(
      `${app}: ${missing.join(", ")} 설정이 필요합니다. .env.supabase.example을 .env.supabase.local로 복사해 값을 입력하세요.`,
    );
  let url;
  try {
    url = new URL(env.NEXT_PUBLIC_SUPABASE_URL);
  } catch {
    throw new Error(
      `${app}: NEXT_PUBLIC_SUPABASE_URL 형식이 올바르지 않습니다.`,
    );
  }
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  )
    throw new Error(
      `${app}: Supabase SaaS 프로젝트의 HTTPS origin URL을 입력하세요.`,
    );
  const key = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.trim();
  if (key.startsWith("sb_secret_"))
    throw new Error(
      `${app}: 공개 환경 변수에는 secret key를 사용할 수 없습니다.`,
    );
  // Legacy anon JWTs remain supported, but service_role tokens must not reach the browser.
  if (!key.startsWith("sb_publishable_")) {
    let role;
    try {
      role = JSON.parse(
        Buffer.from(key.split(".")[1] ?? "", "base64url").toString(),
      ).role;
    } catch {
      /* invalid key below */
    }
    if (role !== "anon")
      throw new Error(
        `${app}: Supabase publishable key 또는 기존 anon key를 입력하세요.`,
      );
  }
}
export function createAppEnvironment({
  root,
  app,
  mode,
  inherited = process.env,
}) {
  if (!(app in APP_PORTS)) throw new Error("지원하지 않는 앱입니다.");
  if (!["mock", "supabase"].includes(mode))
    throw new Error("실행 모드는 mock 또는 supabase여야 합니다.");
  const shared =
    mode === "supabase"
      ? readProfileFile(resolve(root, ".env.supabase.local"))
      : {};
  const local =
    mode === "supabase"
      ? readProfileFile(resolve(root, "apps", app, ".env.supabase.local"))
      : {};
  const env = { ...shared, ...local, ...inherited };
  // CLI-selected mode always wins, including conflicting shell / Next .env.local flags.
  env.TRAVEL_API_MODE = mode;
  env.NEXT_PUBLIC_API_MOCKING = mode === "mock" ? "enabled" : "disabled";
  env.NEXT_PUBLIC_SITE_URL ||= `http://localhost:${APP_PORTS[app]}`;
  if (mode === "mock") {
    for (const key of [
      "NEXT_PUBLIC_SUPABASE_URL",
      "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
      "SUPABASE_URL",
      "SUPABASE_SECRET_KEY",
      "SUPABASE_SERVICE_ROLE_KEY",
      "NEXT_PUBLIC_SENTRY_DSN",
      "SENTRY_AUTH_TOKEN",
    ])
      env[key] = "";
    env.NEXT_PUBLIC_ANALYTICS_ENABLED = "false";
  } else {
    assertSupabaseEnvironment(env, app);
    env.NEXT_PUBLIC_SUPABASE_URL = new URL(env.NEXT_PUBLIC_SUPABASE_URL).origin;
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY =
      env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.trim();
  }
  return env;
}
