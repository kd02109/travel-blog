import { describe, expect, it, vi } from "vitest";
import { handleCallback, handleSignOut, safeReturnPath } from "./auth-flow";

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
    for (const suffix of ["", "?code=rejected"]) {
      const response = await handleCallback(
        new Request(`http://localhost/auth/callback${suffix}`),
        async () => client(new Error("sensitive")),
      );
      expect(response.headers.get("location")).toBe(
        "http://localhost/login?error=oauth",
      );
    }
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
  it("allows only local post routes", () => {
    expect(safeReturnPath("/posts/my-trip#comments")).toBe(
      "/posts/my-trip#comments",
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
});
