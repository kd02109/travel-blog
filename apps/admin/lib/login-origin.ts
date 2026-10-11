type LoginEnvironment = {
  VERCEL_ENV?: string;
  ADMIN_AUTH_ORIGIN?: string;
};

/** Move to the registered admin origin BEFORE the browser creates PKCE cookies. */
export function canonicalAdminLogin(
  request: Request,
  env: LoginEnvironment,
): Response | null {
  const current = new URL(request.url);
  if (
    current.pathname !== "/login" ||
    !["GET", "HEAD"].includes(request.method)
  )
    return null;
  // Local OAuth keeps its own localhost callback. Production can opt into its
  // configured domain; Preview must not silently use an unregistered build URL.
  if (!env.ADMIN_AUTH_ORIGIN && env.VERCEL_ENV !== "preview") return null;

  let target: URL;
  try {
    target = new URL(env.ADMIN_AUTH_ORIGIN ?? "");
    if (
      target.protocol !== "https:" ||
      target.username ||
      target.password ||
      target.pathname !== "/" ||
      target.search ||
      target.hash
    )
      throw new Error("Invalid admin origin");
  } catch {
    return new Response("관리자 로그인 주소 설정을 확인해 주세요.", {
      status: 503,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "private, no-store",
      },
    });
  }
  if (current.origin === target.origin) return null;
  target.pathname = "/login";
  // Never carry codes, tokens, callback state or user-selected destinations to
  // another host. Only known UI notices survive this pre-login redirect.
  const error = current.searchParams.get("error");
  if (
    error &&
    [
      "cancelled",
      "oauth",
      "oauth_exchange",
      "oauth_setup",
      "oauth_account",
      "oauth_email",
      "oauth_rate_limit",
      "oauth_start",
      "offline",
      "expired",
      "unavailable",
      "signout",
    ].includes(error)
  )
    target.searchParams.set("error", error);
  if (current.searchParams.get("status") === "signed_out")
    target.searchParams.set("status", "signed_out");
  return new Response(null, {
    status: 307,
    headers: {
      Location: target.toString(),
      "Cache-Control": "private, no-store",
    },
  });
}
