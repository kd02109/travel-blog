import { afterEach, describe, expect, it, vi } from "vitest";
import { handleErrorEmails } from "./error-email";
const secret = "test-cron-secret-32-characters-long";
const env = {
  CRON_SECRET: secret,
  TRAVEL_ERROR_EMAIL_ENABLED: "true",
  RESEND_API_KEY: "re_test_not_a_real_key",
  ERROR_EMAIL_FROM: "sender@example.invalid",
  ERROR_EMAIL_TO: "reader@example.invalid",
  ERROR_EMAIL_ENVIRONMENT: "preview",
  ERROR_EMAIL_SITE_SLUG: "parents-travel",
  SUPABASE_URL: "https://example.supabase.co",
  SUPABASE_SERVICE_ROLE_KEY: "sb_secret_test",
  VERCEL_ENV: "preview",
};
const job = {
  id: "00000000-0000-4000-8000-000000000001",
  lease_token: "token",
  payload: {
    from: "sender@example.invalid",
    to: "reader@example.invalid",
    app: "web",
    environment: "preview",
    count: 10,
    issue_id: "00000000-0000-4000-8000-000000000002",
  },
};
const request = (auth = true) =>
  new Request("https://admin.example/api/internal/error-alerts", {
    headers: auth ? { Authorization: `Bearer ${secret}` } : {},
  });
afterEach(() => vi.unstubAllGlobals());
describe("error email dispatcher", () => {
  it("rejects missing auth before making network calls", async () => {
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    expect((await handleErrorEmails(request(false), env)).status).toBe(401);
    expect(fetcher).not.toHaveBeenCalled();
  });
  it.each([
    { TRAVEL_ERROR_EMAIL_ENABLED: "false" },
    { NEXT_PUBLIC_API_MOCKING: "enabled" },
    { RESEND_API_KEY: "" },
    { ERROR_EMAIL_TO: "user@example.invalid\r\nBcc: other@example.invalid" },
    { VERCEL_ENV: "production", ERROR_EMAIL_FROM: "onboarding@resend.dev" },
    { ERROR_EMAIL_ENVIRONMENT: "production" },
  ])("fails closed for disabled/invalid configuration %j", async (change) => {
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    expect(
      (await handleErrorEmails(request(), { ...env, ...change })).status,
    ).toBe(503);
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("sends only the frozen safe payload with an idempotency key and acknowledges acceptance", async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      if (url === "https://api.resend.com/emails")
        return Response.json({ id: "provider-id" });
      const action = JSON.parse(String(init.body)).p_action;
      return Response.json(action === "claim" ? job : true);
    });
    const response = await handleErrorEmails(request(), env);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "accepted" });
    expect(calls).toHaveLength(3);
    const mail = calls[1]!;
    expect(new Headers(mail.init.headers).get("Idempotency-Key")).toBe(
      "error-alert/" + job.id,
    );
    expect(JSON.parse(String(mail.init.body))).toEqual({
      from: "sender@example.invalid",
      to: ["reader@example.invalid"],
      subject: "[travel-blog] web preview 오류 알림",
      text: expect.stringContaining("최근 5분 발생: 10회"),
    });
    expect(JSON.parse(String(calls[2]!.init.body)).p_input).toMatchObject({
      id: job.id,
      lease_token: job.lease_token,
      sent: true,
      provider_id: "provider-id",
    });
    expect(new Headers(calls[0]!.init.headers).has("authorization")).toBe(
      false,
    );
  });
  it("does not send when claim returns no eligible alert", async () => {
    const fetcher = vi.fn().mockResolvedValue(Response.json(null));
    vi.stubGlobal("fetch", fetcher);
    expect(await (await handleErrorEmails(request(), env)).json()).toEqual({
      status: "idle",
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("records provider failures without returning or logging their sensitive message", async () => {
    const inputs: Record<string, unknown>[] = [];
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
      if (url === "https://api.resend.com/emails")
        return Response.json(
          { name: "validation_error", message: "private recipient and key" },
          { status: 403 },
        );
      const body = JSON.parse(String(init.body));
      inputs.push(body);
      return Response.json(body.p_action === "claim" ? job : true);
    });
    const response = await handleErrorEmails(request(), env);
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain("private");
    expect(inputs[1]!.p_input).toMatchObject({
      sent: false,
      retryable: false,
      code: "resend_403",
    });
    expect(log).not.toHaveBeenCalled();
    log.mockRestore();
  });
  it("keeps the lease for retry if the final DB acknowledgement is lost", async () => {
    vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
      if (url === "https://api.resend.com/emails")
        return Response.json({ id: "accepted-but-not-recorded" });
      if (JSON.parse(String(init.body)).p_action === "finish")
        throw new Error("db unavailable");
      return Response.json(job);
    });
    expect((await handleErrorEmails(request(), env)).status).toBe(503);
  });
  it("honors provider rate-limit delay without changing the retry payload", async () => {
    let completion: Record<string, unknown> = {};
    vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
      if (url === "https://api.resend.com/emails")
        return new Response(null, {
          status: 429,
          headers: { "Retry-After": "600" },
        });
      const body = JSON.parse(String(init.body));
      if (body.p_action === "finish") completion = body.p_input;
      return Response.json(body.p_action === "claim" ? job : true);
    });
    expect((await handleErrorEmails(request(), env)).status).toBe(503);
    expect(completion).toMatchObject({
      retryable: true,
      retry_after_seconds: 600,
    });
  });
});
