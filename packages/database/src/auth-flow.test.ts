import { describe, expect, it, vi } from "vitest";
import {
  handleCallback,
  handleRememberedCallback,
  handleSignOut,
  rememberOAuthReturn,
  safeReturnPath,
} from "./auth-flow";

function client(error: unknown = null) {
  return {
    auth: {
      exchangeCodeForSession: vi.fn().mockResolvedValue({ error }),
      signOut: vi.fn().mockResolvedValue({ error }),
    },
  };
}

describe("OAuth callbacks", () => {
  it("shows cancellation without reflecting provider details or exchanging code", async () => {
    const create = vi.fn();
    const response = await handleCallback(
      new Request(
        "http://localhost/auth/callback?error=access_denied&error_description=secret&code=ignored",
      ),
      create,
    );
    expect(response.headers.get("location")).toBe(
      "http://localhost/login?error=cancelled",
    );
    expect(create).not.toHaveBeenCalled();
  });
  it.each([
    ["server_error", "unavailable"],
    ["invalid_client", "oauth_setup"],
    ["over_request_rate_limit", "oauth_rate_limit"],
    ["flow_state_expired", "expired"],
    ["unknown_error", "oauth"],
  ])("maps provider error %s to safe guidance", async (error, expected) => {
    const create = vi.fn();
    const response = await handleCallback(
      new Request(
        `http://localhost/auth/callback?error=${error}&error_description=secret-provider-detail`,
      ),
      create,
    );
    expect(response.headers.get("location")).toBe(
      `http://localhost/login?error=${expected}`,
    );
    expect(response.headers.get("location")).not.toContain(
      "secret-provider-detail",
    );
    expect(create).not.toHaveBeenCalled();
  });
  it("uses a known Supabase error code without exposing provider text", async () => {
    const response = await handleCallback(
      new Request(
        "http://localhost/auth/callback?error=server_error&error_code=provider_disabled&error_description=secret-provider-detail",
      ),
      vi.fn(),
    );
    expect(response.headers.get("location")).toBe(
      "http://localhost/login?error=oauth_setup",
    );
  });
  it("does not mistake a denied account for a cancelled Kakao login", async () => {
    const response = await handleCallback(
      new Request(
        "http://localhost/auth/callback?error=access_denied&error_code=user_banned&error_description=private-detail",
      ),
      vi.fn(),
    );
    expect(response.headers.get("location")).toBe(
      "http://localhost/login?error=oauth_account",
    );
  });
  it("exchanges the code and drops external next destinations", async () => {
    const db = client();
    const response = await handleCallback(
      new Request(
        "http://localhost/auth/callback?code=valid&next=https://evil.example",
      ),
      async () => db,
    );
    expect(db.auth.exchangeCodeForSession).toHaveBeenCalledWith("valid");
    expect(response.headers.get("location")).toBe("http://localhost/");
    expect(response.headers.get("cache-control")).toContain("no-store");
  });
  it("returns to a same-site post and preserves it on cancellation", async () => {
    const db = client();
    const response = await handleCallback(
      new Request(
        "http://localhost/auth/callback?code=valid&next=%2Fposts%2Fspring-trip%23comments",
      ),
      async () => db,
    );
    expect(response.headers.get("location")).toBe(
      "http://localhost/posts/spring-trip#comments",
    );
    const cancelled = await handleCallback(
      new Request(
        "http://localhost/auth/callback?error=access_denied&next=%2Fposts%2Fspring-trip%23comments",
      ),
      async () => db,
    );
    expect(cancelled.headers.get("location")).toBe(
      "http://localhost/login?error=cancelled&next=%2Fposts%2Fspring-trip%23comments",
    );
  });
  it("handles missing, rejected codes and service failure", async () => {
    for (const [suffix, expected] of [
      ["", "oauth"],
      ["?code=rejected", "oauth_exchange"],
    ]) {
      const response = await handleCallback(
        new Request(`http://localhost/auth/callback${suffix}`),
        async () => client(new Error("sensitive")),
      );
      expect(response.headers.get("location")).toBe(
        `http://localhost/login?error=${expected}`,
      );
    }
    const expired = await handleCallback(
      new Request("http://localhost/auth/callback?code=x"),
      async () => client({ code: "flow_state_expired" }),
    );
    expect(expired.headers.get("location")).toContain("error=expired");
    const response = await handleCallback(
      new Request("http://localhost/auth/callback?code=x"),
      async () => {
        throw new Error("network");
      },
    );
    expect(response.headers.get("location")).toContain("error=unavailable");
  });
});

describe("OAuth return path", () => {
  const origin = "https://blog.example";
  function remember(next: unknown, requestOrigin: string | null = origin) {
    return rememberOAuthReturn(
      new Request(`${origin}/auth/return`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(requestOrigin ? { origin: requestOrigin } : {}),
        },
        body: JSON.stringify({ next }),
      }),
    );
  }
  it("keeps a post destination out of redirectTo and consumes its short-lived cookie", async () => {
    const saved = await remember("/posts/spring-trip#comments");
    expect(saved.status).toBe(204);
    const cookie = saved.headers.get("set-cookie")!;
    expect(cookie).toContain("HttpOnly; SameSite=Lax; Secure");
    expect(cookie).toContain("Path=/auth/callback; Max-Age=600");
    const response = await handleRememberedCallback(
      new Request(`${origin}/auth/callback?code=valid`, {
        headers: { cookie: cookie.split(";")[0]! },
      }),
      async () => client(),
    );
    expect(response.headers.get("location")).toBe(
      `${origin}/posts/spring-trip#comments`,
    );
    expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
    expect(response.headers.get("cache-control")).toContain("no-store");
  });
  it("preserves the return path on cancellation and clears it on every callback", async () => {
    const saved = await remember("/account");
    const response = await handleRememberedCallback(
      new Request(`${origin}/auth/callback?error=access_denied`, {
        headers: { cookie: saved.headers.get("set-cookie")!.split(";")[0]! },
      }),
      vi.fn(),
    );
    expect(response.headers.get("location")).toBe(
      `${origin}/login?error=cancelled&next=%2Faccount`,
    );
    expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
  });
  it("rejects cross-origin and malformed destination writes", async () => {
    for (const requestOrigin of ["https://evil.example", null]) {
      const response = await remember("/account", requestOrigin);
      expect(response.status).toBe(403);
      expect(response.headers.has("set-cookie")).toBe(false);
    }
    expect((await remember({ path: "/account" })).status).toBe(400);
    expect((await remember("/posts/" + "가".repeat(1000))).status).toBe(400);
  });
  it("sanitizes tampered cookies and ignores callback next query overrides", async () => {
    for (const cookie of [
      "",
      "travel_oauth_return=%",
      "travel_oauth_return=https%3A%2F%2Fevil.example",
      "travel_oauth_return=%2F%2Fevil.example",
    ]) {
      const response = await handleRememberedCallback(
        new Request(`${origin}/auth/callback?code=valid&next=%2Faccount`, {
          headers: { cookie },
        }),
        async () => client(),
      );
      expect(response.headers.get("location")).toBe(`${origin}/`);
      expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
    }
  });
  it("allows only known local return routes", () => {
    expect(safeReturnPath("/posts/my-trip#comments")).toBe(
      "/posts/my-trip#comments",
    );
    expect(safeReturnPath("/account")).toBe("/account");
    expect(safeReturnPath("/posts?category=day-walk")).toBe(
      "/posts?category=day-walk",
    );
    for (const value of [
      "https://evil.example",
      "//evil.example",
      "/admin",
      "/posts/a/../../admin",
    ]) {
      expect(safeReturnPath(value)).toBe("/");
    }
  });
});

describe("sign out", () => {
  it("rejects cross-site, missing-origin and GET requests without signing out", async () => {
    const create = vi.fn();
    for (const options of [
      { method: "POST", headers: { origin: "https://evil.example" } },
      { method: "POST" },
      { method: "GET" },
    ]) {
      expect(
        (
          await handleSignOut(
            new Request("http://localhost/auth/signout", options),
            create,
          )
        ).status,
      ).toBe(403);
    }
    expect(create).not.toHaveBeenCalled();
  });
  it("revokes the current session and returns a non-cacheable GET redirect", async () => {
    const db = client();
    const request = new Request("http://localhost/auth/signout", {
      method: "POST",
      headers: { origin: "http://localhost" },
    });
    const response = await handleSignOut(request, async () => db);
    expect(db.auth.signOut).toHaveBeenCalledWith({ scope: "local" });
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toContain("status=signed_out");
    const failed = await handleSignOut(request, async () =>
      client(new Error("network")),
    );
    expect(failed.headers.get("location")).toContain("error=signout");
  });
  it("uses the public site's destination after a successful sign out", async () => {
    const request = new Request("http://localhost/auth/signout", {
      method: "POST",
      headers: { origin: "http://localhost" },
    });
    const success = await handleSignOut(request, async () => client(), {
      successPath: "/",
    });
    expect(success.headers.get("location")).toBe("http://localhost/");

    const failed = await handleSignOut(
      request,
      async () => client(new Error("network")),
      { successPath: "/" },
    );
    expect(failed.headers.get("location")).toContain("error=signout");
  });
});
