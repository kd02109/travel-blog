import { describe, expect, it, vi } from "vitest";
import { createWorkerFetch, workerApiKeyHeaders } from "./request-auth.ts";

describe("worker API key headers", () => {
  it("sends a Supabase secret key only as an apikey", () => {
    expect(workerApiKeyHeaders("sb_secret_example")).toEqual({
      apikey: "sb_secret_example",
    });
  });

  it("keeps legacy service role JWT authentication compatible", () => {
    expect(workerApiKeyHeaders("legacy-service-role-jwt")).toEqual({
      apikey: "legacy-service-role-jwt",
      Authorization: "Bearer legacy-service-role-jwt",
    });
  });

  it("strips only the secret key bearer header from Supabase JS requests", async () => {
    const fetchImplementation = vi.fn<typeof fetch>(
      async () => new Response("ok"),
    );
    const workerFetch = createWorkerFetch(
      "sb_secret_example",
      fetchImplementation,
    );

    await workerFetch("https://example.supabase.co/rest/v1/rpc/example", {
      headers: { Authorization: "Bearer sb_secret_example" },
    });

    const [, init] = fetchImplementation.mock.calls[0]!;
    const headers = new Headers(init?.headers);
    expect(headers.get("Authorization")).toBeNull();
    expect(headers.get("apikey")).toBe("sb_secret_example");
  });
});
