export const authMessages: Record<string, string> = {
  cancelled: "카카오 로그인을 취소했습니다. 원할 때 다시 로그인해 주세요.",
  oauth: "로그인을 완료하지 못했습니다. 처음부터 다시 시도해 주세요.",
  expired: "로그인 시간이 만료되었습니다. 다시 로그인해 주세요.",
  unavailable: "인증 서비스에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.",
  signout: "로그아웃하지 못했습니다. 연결 상태를 확인하고 다시 시도해 주세요.",
  signed_out: "로그아웃했습니다.",
};

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
      loginErrorPath(error === "access_denied" ? "cancelled" : "oauth", next),
    );
  const code = params.get("code");
  if (!code) return redirect(request, loginErrorPath("oauth", next));
  try {
    const client = await createClient();
    const { error } = await client.auth.exchangeCodeForSession(code);
    return redirect(request, error ? loginErrorPath("oauth", next) : next);
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
