import { fileURLToPath } from "node:url";
import { APP_PORTS, createAppEnvironment } from "./environment.mjs";
const root = fileURLToPath(new URL("../", import.meta.url));
try {
  const apps = Object.keys(APP_PORTS).map((app) => ({
    app,
    env: createAppEnvironment({ root, app, mode: "supabase" }),
  }));
  for (const { app, env } of apps) {
    const url = env.NEXT_PUBLIC_SUPABASE_URL;
    // Read-only integration checks. No login, writes, uploads, seeds or DB reset.
    async function read(path, init = {}) {
      const response = await fetch(`${url}${path}`, {
        ...init,
        signal: AbortSignal.timeout(10000),
      });
      if (!response.ok)
        throw new Error(`${app}: ${path} HTTP ${response.status}`);
      return response.json();
    }
    await read("/auth/v1/settings", {
      headers: { apikey: env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY },
    });
    await read("/functions/v1/travel-api");
    const api = (action, input) =>
      read("/functions/v1/travel-api", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, input }),
      });
    const site = await api("site.get", { slug: "parents-travel" });
    if (typeof site.id !== "string" || typeof site.name !== "string")
      throw new Error(`${app}: site.get 응답 규격 불일치`);
    const posts = await api("posts.list", { site_id: site.id, limit: 1 });
    if (!Array.isArray(posts))
      throw new Error(`${app}: posts.list 응답 규격 불일치`);
    console.log(
      `[${app}] PASS · Auth 공개 키 / Edge API / 사이트 / 공개 글 조회`,
    );
  }
} catch (error) {
  console.error(`Supabase 연결 검사 실패: ${error.message}`);
  process.exitCode = 1;
}
