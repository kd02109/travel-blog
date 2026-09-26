import { createServer, Response as MirageResponse } from "miragejs";
import { createMockEngine } from "./engine";
import { MOCK_API_PATH } from "./fixtures";
import type { MockOptions, MockResult } from "./types";
export type ServerOptions = MockOptions & {
  environment?: "development" | "test";
  timing?: number;
  supabaseUrl?: string;
};
const response = (result: MockResult) =>
  new MirageResponse(
    result.status,
    {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      ...result.headers,
    },
    JSON.stringify(result.body),
  );
export function startMockServer(options: ServerOptions = {}) {
  if (process.env.NODE_ENV === "production")
    throw new Error("Mock API is disabled in production.");
  if (typeof window === "undefined")
    throw new Error(
      "MirageJS requires a browser. Use createMockEngine for Node unit tests.",
    );
  const nativeFetch = window.fetch.bind(window);
  const engine = createMockEngine({
    ...options,
    origin: window.location.origin,
  });
  const endpoints = [MOCK_API_PATH];
  if (options.supabaseUrl) {
    const url = new URL(options.supabaseUrl);
    if (!["http:", "https:"].includes(url.protocol))
      throw new Error("Invalid Supabase URL");
    endpoints.push(`${url.origin}/functions/v1/travel-api`);
  }
  const server = createServer({
    environment: options.environment ?? "development",
    logging: false,
    routes() {
      this.timing =
        options.timing ?? (options.scenario === "slow" ? 1500 : 250);
      for (const endpoint of endpoints) {
        this.get(endpoint, () =>
          response({
            status: 200,
            body: { ok: true, service: "travel-api", mock: true },
          }),
        );
        this.post(endpoint, (_schema, request) => {
          let body: unknown;
          try {
            body = JSON.parse(request.requestBody);
          } catch {
            return response({
              status: 400,
              body: { error: "invalid_json", request_id: "mock-invalid-json" },
            });
          }
          return response(engine.handle(body, request.requestHeaders));
        });
      }
      this.get("/api/site", () =>
        response(engine.handle({ action: "site.get", input: {} })),
      );
      // Allow Next navigation, chunks, and local static fixtures only. Unhandled API
      // requests fail in Mirage instead of leaking to a real database or auth service.
      this.passthrough((request) => {
        const url = new URL(request.url, window.location.origin);
        return (
          url.origin === window.location.origin &&
          (url.pathname === "/api/health" ||
            !/^\/(?:api|__mock__|auth\/v1|rest\/v1|storage\/v1|functions\/v1)(?:\/|$)/.test(
              url.pathname,
            ))
        );
      });
    },
  });
  // Pretender Response objects do not implement streaming bodies. Keep Next RSC
  // and document navigation on native fetch; intercept only API requests.
  const interceptedFetch = window.fetch.bind(window);
  window.fetch = (input, init) => {
    const url = new URL(
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : input.url,
      window.location.origin,
    );
    const apiPath =
      /^\/(?:api|__mock__|auth\/v1|rest\/v1|storage\/v1|functions\/v1)(?:\/|$)/.test(
        url.pathname,
      );
    return url.origin !== window.location.origin || apiPath
      ? interceptedFetch(input, init)
      : nativeFetch(input, init);
  };
  return {
    apiPath: MOCK_API_PATH,
    engine,
    shutdown: () => {
      server.shutdown();
      window.fetch = nativeFetch;
    },
  };
}
export type MockRuntime = ReturnType<typeof startMockServer>;
