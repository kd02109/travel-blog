import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const mocks = vi.hoisted(() => ({ createServerClient: vi.fn() }));
vi.mock("@supabase/ssr", () => ({
  createServerClient: mocks.createServerClient,
}));
import { refreshSession } from "./proxy";

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "test-key");
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

it("forwards a generated request ID without trusting a caller-supplied one", async () => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "");
  const request = new NextRequest("https://blog.example/posts", {
    headers: { "x-travel-request-id": "attacker", cookie: "theme=light" },
  });
  const generated = "d31c4ea2-d5a5-4801-8d75-f5ab6fb6b1e5";
  const response = await refreshSession(request, generated);
  expect(response.headers.get("x-middleware-request-x-travel-request-id")).toBe(
    generated,
  );
  expect(response.headers.get("x-middleware-request-cookie")).toBe(
    "theme=light",
  );
});

describe("session refresh feedback", () => {
  it("retains expiry feedback while removing invalid auth cookies", async () => {
    const next = vi.spyOn(NextResponse, "next");
    mocks.createServerClient.mockImplementation((_url, _key, options) => ({
      auth: {
        getUser: async () => {
          options.cookies.setAll([
            {
              name: "sb-example-auth-token",
              value: "",
              options: { path: "/", maxAge: 0 },
            },
          ]);
          return { error: { code: "refresh_token_not_found", status: 400 } };
        },
      },
    }));
    const response = await refreshSession(
      new NextRequest("https://blog.example/account", {
        headers: { cookie: "sb-example-auth-token=expired" },
      }),
      "test-request-id",
    );
    const forwarded = next.mock.lastCall?.[0]?.request?.headers as Headers;
    expect(forwarded.get("x-travel-session-expired")).toBe("1");
    expect(forwarded.get("x-travel-request-id")).toBe("test-request-id");
    expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(response.headers.has("x-travel-session-expired")).toBe(false);
  });
  it.each([null, { code: "session_not_found", status: 400 }, { status: 503 }])(
    "strips caller-supplied expiry feedback for an anonymous request",
    async (error) => {
      const next = vi.spyOn(NextResponse, "next");
      mocks.createServerClient.mockReturnValue({
        auth: { getUser: async () => ({ error }) },
      });
      await refreshSession(
        new NextRequest("https://blog.example/account", {
          headers: { "x-travel-session-expired": "1" },
        }),
      );
      const forwarded = next.mock.lastCall?.[0]?.request?.headers as Headers;
      expect(forwarded.has("x-travel-session-expired")).toBe(false);
    },
  );
});
