import { timingSafeEqual } from "node:crypto";

const headers = {
  "Cache-Control": "no-store",
  "X-Robots-Tag": "noindex, nofollow",
};
const mailbox = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;
type Env = Record<string, string | undefined>;
type Alert = {
  id: string;
  lease_token: string;
  payload: {
    from: string;
    to: string;
    app: string;
    environment: string;
    count: number;
    issue_id: string;
    admin_url?: string | null;
  };
};

// Called only by the server-only route. Never import this module into client code.
export async function handleErrorEmails(request: Request, env: Env) {
  const expected = Buffer.from(`Bearer ${env.CRON_SECRET ?? ""}`);
  const supplied = Buffer.from(request.headers.get("authorization") ?? "");
  if (
    !env.CRON_SECRET ||
    env.CRON_SECRET.length < 32 ||
    supplied.length !== expected.length ||
    !timingSafeEqual(supplied, expected)
  )
    return new Response(null, { status: 401, headers });
  const unavailable = () =>
    Response.json({ status: "unavailable" }, { status: 503, headers });
  if (
    env.TRAVEL_ERROR_EMAIL_ENABLED !== "true" ||
    env.NEXT_PUBLIC_API_MOCKING === "enabled"
  )
    return unavailable();
  const from = env.ERROR_EMAIL_FROM?.trim() ?? "";
  const to = env.ERROR_EMAIL_TO?.trim() ?? "";
  const environment = env.ERROR_EMAIL_ENVIRONMENT;
  const serviceKey = env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY;
  if (
    !env.RESEND_API_KEY ||
    !serviceKey ||
    !environment ||
    !["preview", "production", "development"].includes(environment) ||
    (env.VERCEL_ENV && env.VERCEL_ENV !== environment) ||
    !mailbox.test(from) ||
    !mailbox.test(to) ||
    from.length > 254 ||
    to.length > 254 ||
    (environment === "production" && from.toLowerCase().endsWith("@resend.dev"))
  )
    return unavailable();
  let base: URL;
  try {
    base = new URL(env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL || "");
    const local =
      env.VERCEL_ENV === undefined &&
      ["127.0.0.1", "localhost"].includes(base.hostname);
    if (
      (!local && base.protocol !== "https:") ||
      base.username ||
      base.password ||
      base.pathname !== "/" ||
      base.search ||
      base.hash
    )
      return unavailable();
  } catch {
    return unavailable();
  }
  const keyHeaders: Record<string, string> = {
    apikey: serviceKey,
    "Content-Type": "application/json",
  };
  if (!serviceKey.startsWith("sb_secret_"))
    keyHeaders.Authorization = `Bearer ${serviceKey}`;
  async function rpc(
    action: string,
    input: Record<string, unknown>,
  ): Promise<unknown> {
    const response = await fetch(
      new URL("/rest/v1/rpc/travel_error_email", base),
      {
        method: "POST",
        headers: keyHeaders,
        body: JSON.stringify({ p_action: action, p_input: input }),
        signal: AbortSignal.timeout(5_000),
        cache: "no-store",
      },
    );
    if (!response.ok) throw new Error("alert_database_unavailable");
    return response.json();
  }
  try {
    const job = (await rpc("claim", {
      environment,
      site_slug: env.ERROR_EMAIL_SITE_SLUG || "parents-travel",
      from,
      to,
      admin_url: env.ERROR_EMAIL_ADMIN_URL,
    })) as Alert | null;
    if (!job) return Response.json({ status: "idle" }, { headers });
    const p = job.payload;
    // Frozen SQL snapshot is reused verbatim on retries within 23 hours.
    // No route, error message, stack, token or request content leaves the DB.
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        "Idempotency-Key": `error-alert/${job.id}`,
      },
      signal: AbortSignal.timeout(8_000),
      body: JSON.stringify({
        from: p.from,
        to: [p.to],
        subject: `[travel-blog] ${p.app} ${p.environment} 오류 알림`,
        text: [
          "블로그에서 반복 오류가 감지되었습니다.",
          `앱: ${p.app}`,
          `환경: ${p.environment}`,
          `오류 ID: ${p.issue_id}`,
          `최근 5분 발생: ${p.count}회`,
          "메시지와 스택은 개인정보 보호를 위해 이메일에 포함하지 않습니다.",
          "관리자 권한으로 오류 기록을 확인해 주세요.",
          ...(p.admin_url &&
          /^https:\/\/[A-Za-z0-9.-]+(?::[0-9]+)?$/.test(p.admin_url) &&
          /^[0-9a-f-]{36}$/i.test(p.issue_id)
            ? [`${p.admin_url}/error-analytics-preview/${p.issue_id}`]
            : []),
        ].join("\n"),
      }),
    });
    // Do not parse or log provider error bodies: they can contain recipient data.
    const data = response.ok
      ? ((await response.json()) as { id?: string })
      : null;
    const status = response.status;
    const retryHeader = response.headers.get("Retry-After");
    const delay =
      retryHeader && /^\d+$/.test(retryHeader)
        ? Number(retryHeader)
        : retryHeader
          ? Math.ceil((Date.parse(retryHeader) - Date.now()) / 1000)
          : 0;
    const retryAfter = Number.isFinite(delay)
      ? Math.max(0, Math.min(86400, delay))
      : 0;
    const sent =
      response.ok && typeof data?.id === "string" && data.id.length <= 100;
    const acknowledged = await rpc("finish", {
      id: job.id,
      lease_token: job.lease_token,
      sent,
      provider_id: data?.id,
      code: status ? `resend_${status}` : "resend_unavailable",
      retryable:
        response.ok || status === 429 || status === 409 || status >= 500,
      retry_after_seconds: retryAfter,
    });
    if (!acknowledged || !sent) return unavailable();
    // Accepted by Resend is not proof of inbox delivery.
    return Response.json({ status: "accepted" }, { headers });
  } catch {
    console.warn({ event: "error_email_dispatch_failed", environment });
    // A lost response leaves the lease to expire. Reuse the same provider key.
    // Never feed mail failures back into error.capture or log provider payloads.
    return unavailable();
  }
}
