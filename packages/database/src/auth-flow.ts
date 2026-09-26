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

// Never reflect provider error descriptions, tokens, or arbitrary next URLs.
export async function handleCallback(
  request: Request,
  createClient: () => Promise<AuthClient>,
) {
  const params = new URL(request.url).searchParams;
  const error = params.get("error");
  if (error)
    return redirect(
      request,
      `/login?error=${error === "access_denied" ? "cancelled" : "oauth"}`,
    );
  const code = params.get("code");
  if (!code) return redirect(request, "/login?error=oauth");
  try {
    const client = await createClient();
    const { error } = await client.auth.exchangeCodeForSession(code);
    return redirect(request, error ? "/login?error=oauth" : "/");
  } catch {
    return redirect(request, "/login?error=unavailable");
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
