const messages = {
  cancelled: "카카오 로그인을 취소했습니다. 원할 때 다시 로그인해 주세요.",
  oauth:
    "카카오 로그인을 완료하지 못했습니다. 다시 시도해 주세요. 문제가 계속되면 관리자에게 문의해 주세요.",
  oauth_exchange:
    "카카오 로그인 확인에 실패했습니다. 이 브라우저에서 다시 로그인해 주세요. 문제가 계속되면 관리자에게 문의해 주세요.",
  oauth_setup:
    "카카오 로그인을 사용할 수 없습니다. 관리자에게 로그인 설정 확인을 요청해 주세요.",
  oauth_account:
    "이 계정으로 카카오 로그인을 완료할 수 없습니다. 관리자에게 계정 상태를 문의해 주세요.",
  oauth_email:
    "이메일 인증이 필요합니다. 받은 메일에서 인증을 마친 뒤 다시 로그인해 주세요.",
  oauth_rate_limit: "로그인 요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.",
  oauth_start:
    "카카오 로그인 페이지를 열지 못했습니다. 다시 시도해 주세요. 문제가 계속되면 관리자에게 문의해 주세요.",
  offline: "인터넷 연결을 확인한 뒤 다시 시도해 주세요.",
  expired: "로그인 시간이 만료되었습니다. 다시 로그인해 주세요.",
  unavailable: "인증 서비스에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.",
  signout: "로그아웃하지 못했습니다. 연결 상태를 확인하고 다시 시도해 주세요.",
  signed_out: "로그아웃했습니다.",
};
export const authMessages: typeof messages & Record<string, string> = messages;

type AuthClient = {
  auth: {
    exchangeCodeForSession(code: string): Promise<{ error: unknown }>;
    signOut(options: { scope: "local" }): Promise<{ error: unknown }>;
  };
};

function redirect(request: Request, path: string) {
  return new Response(null, {
    status: 303,
    headers: {
      Location: new URL(path, request.url).toString(),
      "Cache-Control": "private, no-store",
    },
  });
}

/** Accept only same-site post return paths; OAuth parameters must not become open redirects. */
export function safeReturnPath(value: string | null | undefined): string {
  if (
    !value ||
    value.length > 2048 ||
    !value.startsWith("/") ||
    value.startsWith("//")
  )
    return "/";
  try {
    const url = new URL(value, "http://travel.local");
    if (
      url.origin !== "http://travel.local" ||
      !/^\/posts\/[^/]+$/.test(url.pathname)
    )
      return "/";
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return "/";
  }
}

function loginErrorPath(error: string, next: string) {
  const query = new URLSearchParams({ error });
  if (next !== "/") query.set("next", next);
  return `/login?${query.toString()}`;
}

function oauthCallbackFailure(error: string, errorCode: string | null) {
  if (errorCode === "provider_email_needs_verification") return "oauth_email";
  if (errorCode === "user_banned" || errorCode === "signup_disabled")
    return "oauth_account";
  if (error === "access_denied" && !errorCode) return "cancelled";
  const codes = [error, errorCode];
  if (
    codes.some((code) =>
      [
        "provider_disabled",
        "oauth_provider_not_supported",
        "invalid_client",
        "misconfigured",
      ].includes(code ?? ""),
    )
  )
    return "oauth_setup";
  if (codes.includes("over_request_rate_limit")) return "oauth_rate_limit";
  if (
    codes.some((code) =>
      ["flow_state_expired", "flow_state_not_found"].includes(code ?? ""),
    )
  )
    return "expired";
  if (
    codes.some((code) =>
      ["server_error", "temporarily_unavailable", "request_timeout"].includes(
        code ?? "",
      ),
    )
  )
    return "unavailable";
  return "oauth";
}

function oauthExchangeFailure(error: unknown) {
  if (error && typeof error === "object" && "code" in error) {
    const code = error.code;
    if (code === "over_request_rate_limit") return "oauth_rate_limit";
    if (code === "flow_state_expired" || code === "flow_state_not_found")
      return "expired";
  }
  return "oauth_exchange";
}

// Never reflect provider error descriptions, tokens, or arbitrary next URLs.
export async function handleCallback(
  request: Request,
  createClient: () => Promise<AuthClient>,
) {
  const params = new URL(request.url).searchParams;
  const next = safeReturnPath(params.get("next"));
  const error = params.get("error");
  if (error)
    return redirect(
      request,
      loginErrorPath(
        oauthCallbackFailure(error, params.get("error_code")),
        next,
      ),
    );
  const code = params.get("code");
  if (!code) return redirect(request, loginErrorPath("oauth", next));
  try {
    const client = await createClient();
    const { error } = await client.auth.exchangeCodeForSession(code);
    return redirect(
      request,
      error ? loginErrorPath(oauthExchangeFailure(error), next) : next,
    );
  } catch {
    return redirect(request, loginErrorPath("unavailable", next));
  }
}

export async function handleSignOut(
  request: Request,
  createClient: () => Promise<AuthClient>,
) {
  // POST + exact origin check prevents cross-site logout submissions.
  if (
    request.method !== "POST" ||
    request.headers.get("origin") !== new URL(request.url).origin
  )
    return new Response("Forbidden", {
      status: 403,
      headers: { "Cache-Control": "no-store" },
    });
  try {
    const client = await createClient();
    const { error } = await client.auth.signOut({ scope: "local" });
    return redirect(
      request,
      error ? "/login?error=signout" : "/login?status=signed_out",
    );
  } catch {
    return redirect(request, "/login?error=signout");
  }
}
