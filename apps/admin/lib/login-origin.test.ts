import { describe, expect, it } from "vitest";
import { canonicalAdminLogin } from "./login-origin";

const origin = "https://admin-git-dev.example.com";
const preview = { VERCEL_ENV: "preview", ADMIN_AUTH_ORIGIN: origin };
const request = (path = "/login", host = "https://admin-build.example.com") =>
  new Request(`${host}${path}`);

describe("admin OAuth login origin", () => {
  it("moves deployment-specific login to the registered origin before PKCE starts", () => {
    const response = canonicalAdminLogin(request(), preview)!;
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(`${origin}/login`);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });

  it("does not redirect the registered origin or local development", () => {
    expect(canonicalAdminLogin(request("/login", origin), preview)).toBeNull();
    expect(
      canonicalAdminLogin(request("/login", "http://localhost:3002"), {}),
    ).toBeNull();
  });

  it("never forwards OAuth credentials or arbitrary destinations between hosts", () => {
    const response = canonicalAdminLogin(
      request(
        "/login?error=expired&status=signed_out&code=secret&next=https://evil.test&access_token=secret",
      ),
      preview,
    )!;
    expect(response.headers.get("location")).toBe(
      `${origin}/login?error=expired&status=signed_out`,
    );
  });

  it("leaves callbacks, logout and API requests on their original origin", () => {
    for (const path of [
      "/auth/callback?code=test",
      "/auth/signout",
      "/api/internal/media-worker",
      "/posts",
    ]) {
      expect(canonicalAdminLogin(request(path), preview)).toBeNull();
    }
    expect(
      canonicalAdminLogin(
        new Request(`${origin}/login`, { method: "POST" }),
        preview,
      ),
    ).toBeNull();
  });

  it.each([
    undefined,
    "",
    "not a URL",
    "http://admin.example.com",
    "https://user:pass@admin.example.com",
    "https://admin.example.com/auth/callback",
    "https://admin.example.com?next=evil",
    "https://admin.example.com/#fragment",
  ])(
    "blocks Preview OAuth with invalid configured origin %s rather than falling back to the blog",
    (ADMIN_AUTH_ORIGIN) => {
      const response = canonicalAdminLogin(request(), {
        VERCEL_ENV: "preview",
        ADMIN_AUTH_ORIGIN,
      })!;
      expect(response.status).toBe(503);
      expect(response.headers.get("location")).toBeNull();
    },
  );

  it("uses only server configuration, ignoring spoofed forwarded hosts and query values", () => {
    const response = canonicalAdminLogin(
      new Request("https://build.example.com/login?error=https://evil.test", {
        headers: { "x-forwarded-host": "evil.test" },
      }),
      preview,
    )!;
    expect(response.headers.get("location")).toBe(`${origin}/login`);
  });

  it("supports an explicitly configured production admin domain", () => {
    expect(
      canonicalAdminLogin(request(), {
        VERCEL_ENV: "production",
        ADMIN_AUTH_ORIGIN: "https://admin.example.com",
      })?.headers.get("location"),
    ).toBe("https://admin.example.com/login");
  });
});
