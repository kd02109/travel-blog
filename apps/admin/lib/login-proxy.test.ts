import { afterEach, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const refresh = vi.hoisted(() => vi.fn());
vi.mock("@repo/database/proxy", () => ({ refreshSession: refresh }));
import { proxy } from "../proxy";

afterEach(() => {
  vi.unstubAllEnvs();
  refresh.mockReset();
});

it("redirects before accessing Supabase or creating cookies on a deployment hostname", async () => {
  vi.stubEnv("VERCEL_ENV", "preview");
  vi.stubEnv("ADMIN_AUTH_ORIGIN", "https://admin.example.com");
  const response = await proxy(
    new NextRequest("https://build.example.com/login"),
  );
  expect(response.status).toBe(307);
  expect(response.headers.get("location")).toBe(
    "https://admin.example.com/login",
  );
  expect(response.headers.get("set-cookie")).toBeNull();
  expect(refresh).not.toHaveBeenCalled();
});

it("refreshes the session normally on the registered admin host", async () => {
  vi.stubEnv("VERCEL_ENV", "preview");
  vi.stubEnv("ADMIN_AUTH_ORIGIN", "https://admin.example.com");
  refresh.mockResolvedValue(NextResponse.next());
  const request = new NextRequest("https://admin.example.com/login");
  const response = await proxy(request);
  expect(response.status).toBe(200);
  expect(refresh).toHaveBeenCalledWith(request, expect.any(String));
});
