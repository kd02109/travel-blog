import { afterEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { refreshSession } from "./proxy";

afterEach(() => vi.unstubAllEnvs());

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
