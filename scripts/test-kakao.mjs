import { fileURLToPath } from "node:url";
import { createAppEnvironment } from "./environment.mjs";
const root = fileURLToPath(new URL("../", import.meta.url));
try {
  for (const app of ["web", "admin"]) {
    const env = createAppEnvironment({ root, app, mode: "supabase" });
    const auth = `${env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1`;
    const response = await fetch(`${auth}/settings`, {
      headers: { apikey: env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY },
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok)
      throw new Error(`${app}: Auth 설정 HTTP ${response.status}`);
    const settings = await response.json();
    if (!settings.external?.kakao)
      throw new Error(`${app}: Kakao provider 비활성화`);
    const callback = new URL("/auth/callback", env.NEXT_PUBLIC_SITE_URL).href;
    const authorize = new URL(`${auth}/authorize`);
    authorize.searchParams.set("provider", "kakao");
    authorize.searchParams.set("redirect_to", callback);
    // Start only; do not follow redirects, sign in, or exchange a user's code.
    const result = await fetch(authorize, {
      redirect: "manual",
      signal: AbortSignal.timeout(10000),
    });
    const location = result.headers.get("location");
    if (result.status !== 302 || !location)
      throw new Error(`${app}: OAuth 시작 HTTP ${result.status}`);
    const kakao = new URL(location);
    if (
      kakao.origin !== "https://kauth.kakao.com" ||
      kakao.pathname !== "/oauth/authorize"
    )
      throw new Error(`${app}: 예상하지 못한 OAuth 목적지`);
    if (kakao.searchParams.get("redirect_uri") !== `${auth}/callback`)
      throw new Error(`${app}: Supabase callback 불일치`);
    console.log(
      `[${app}] PASS · Kakao 활성화 / 인가 요청 302 / Supabase callback 일치`,
    );
    console.log(`  앱 callback 확인 대상: ${callback}`);
  }
  console.log(
    "실제 카카오 동의·코드 교환·앱 redirect allowlist·로그아웃 완료는 브라우저에서 별도 검증해야 합니다.",
  );
} catch (error) {
  console.error(`Kakao 검사 실패: ${error.message}`);
  process.exitCode = 1;
}
