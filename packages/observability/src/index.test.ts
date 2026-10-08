import { afterEach, expect, it, vi } from "vitest";
import {
  captureException,
  errorRoute,
  maskErrorText,
  parseSafeStackFrames,
  sanitizeStackFrames,
} from "./index";
import { relayErrorReport } from "./relay";

afterEach(() => vi.unstubAllGlobals());

it("reduces dynamic URLs to route templates", () => {
  expect(errorRoute("/posts/private-email@example.com?token=secret")).toBe(
    "/posts/:id",
  );
  expect(errorRoute("/write/10f808a6-a946-475d-a973-3f2b4029ad01")).toBe(
    "/write/:id",
  );
  expect(errorRoute("/auth/callback?code=secret")).toBe("/auth");
  expect(errorRoute("/private-user-slug?token=secret")).toBe("/unknown");
  expect(errorRoute("/posts/[slug]")).toBe("/posts/:id");
});

it("sends a bounded envelope without the raw error or URL", async () => {
  const fetchMock = vi
    .fn()
    .mockResolvedValue(new Response(null, { status: 202 }));
  vi.stubGlobal("fetch", fetchMock);
  const error = new Error("private@example.com token=secret");
  error.stack = "https://example.com/auth/callback?code=secret";
  await captureException(error, {
    service: "web",
    source: "browser",
    code: "render_boundary",
    route: "/posts/private@example.com?code=secret",
    enabled: true,
    endpoint: "/api/errors",
  });
  const sent = JSON.stringify(JSON.parse(fetchMock.mock.calls[0]![1].body));
  expect(sent).toContain('"route":"/posts/:id"');
  expect(sent).not.toContain("private@example.com");
  expect(sent).not.toContain("token=secret");
  expect(sent).not.toContain("code=secret");
  const input = JSON.parse(fetchMock.mock.calls[0]![1].body).input;
  expect(input.masked_message).toContain("[email]");
  expect(input.masked_message).toContain("[credential]");
  expect(input.masked_stack).toBe("[url]");
});

it("redacts common secrets before truncation while retaining useful frames", () => {
  const text = maskErrorText(
    "TypeError: failed for private@example.com at https://example.com/a?token=secret\n" +
      "at render (/Users/person/project/page.tsx:12:3) Bearer abc.def.ghi " +
      "password=hunter2 192.168.1.2",
    1024,
  );
  expect(text).toContain("TypeError: failed");
  expect(text).toContain("at render");
  for (const secret of [
    "private@example.com",
    "https://example.com",
    "token=secret",
    "/Users/person",
    "abc.def.ghi",
    "hunter2",
    "192.168.1.2",
  ])
    expect(text).not.toContain(secret);
  expect(
    maskErrorText("a".repeat(9000) + " token=secret", 4096)?.length,
  ).toBeLessThanOrEqual(4096);
  expect(maskErrorText("x".repeat(65537), 1024)).toBeNull();
  const credentialText = maskErrorText(
    "Cookie: session=abc\nsb_secret_short123 10f808a6-a946-475d-a973-3f2b4029ad01",
    1024,
  );
  expect(credentialText).not.toContain("abc");
  expect(credentialText).not.toContain("sb_secret_short123");
  expect(credentialText).not.toContain("10f808a6");
});

it("extracts only static build or source locations from error stacks", () => {
  const frames = parseSafeStackFrames(
    [
      "TypeError: failed for private@example.com",
      "    at PostImage (https://blog.example/_next/static/chunks/app/post-abc.js?token=secret:12:34)",
      "    at render (/Users/person/work/travel-blog/apps/web/app/posts/page.tsx:42:7)",
      "    at ignored (https://blog.example/posts/private@example.com:2:4)",
    ].join("\n"),
  );
  expect(frames).toEqual([
    {
      function_name: "PostImage",
      file: "_next/static/chunks/app/post-abc.js",
      line: 12,
      column: 34,
    },
    {
      function_name: "render",
      file: "apps/web/app/posts/page.tsx",
      line: 42,
      column: 7,
    },
  ]);
  expect(JSON.stringify(frames)).not.toMatch(
    /private@example\.com|token=secret|\/Users\/person|blog\.example/,
  );
});

it("drops forged frame paths and keeps only bounded diagnostic context", () => {
  expect(
    sanitizeStackFrames([
      {
        function_name: "render",
        file: "https://example.com/a.js?token=secret",
        line: 1,
        column: 2,
      },
      {
        function_name: "render",
        file: "apps/web/../../secret.ts",
        line: 1,
        column: 2,
      },
      {
        function_name: "render",
        file: "apps/web/private@example.com.js",
        line: 1,
        column: 2,
      },
      {
        function_name: "render",
        file: "_next/static/chunks/app/page.js",
        line: 1,
        column: 2,
        cookie: "secret",
      },
    ]),
  ).toEqual([
    {
      function_name: "render",
      file: "_next/static/chunks/app/page.js",
      line: 1,
      column: 2,
    },
  ]);
});

it("attaches safe action, status and original API request ID without the body", async () => {
  const fetchMock = vi
    .fn()
    .mockResolvedValue(new Response(null, { status: 202 }));
  vi.stubGlobal("fetch", fetchMock);
  const error = Object.assign(new Error("request failed"), {
    name: "TravelApiError",
    status: 503,
    operation: "admin.post.save",
    requestId: "d31c4ea2-d5a5-4801-8d75-f5ab6fb6b1e5",
    requestBody: { password: "secret" },
  });
  await captureException(error, {
    service: "admin",
    source: "browser",
    code: "unhandled_rejection",
    route: "/write/private-slug?token=secret",
    enabled: true,
    endpoint: "/api/errors",
  });
  const input = JSON.parse(fetchMock.mock.calls[0]![1].body).input;
  expect(input).toMatchObject({
    operation: "admin.post.save",
    dependency: "travel_api",
    http_status: 503,
    origin_request_id: "d31c4ea2-d5a5-4801-8d75-f5ab6fb6b1e5",
  });
  expect(JSON.stringify(input)).not.toContain("password");
  expect(JSON.stringify(input)).not.toContain("private-slug");
});

it("does not let unusual Error accessors interrupt the calling page", async () => {
  const fetchMock = vi
    .fn()
    .mockResolvedValue(new Response(null, { status: 202 }));
  vi.stubGlobal("fetch", fetchMock);
  const error = new Error("safe failure");
  Object.defineProperty(error, "stack", {
    get() {
      throw new Error("private stack");
    },
  });
  await expect(
    captureException(error, {
      service: "admin",
      source: "browser",
      route: "/write/123",
      code: "render_boundary",
      enabled: true,
      endpoint: "/api/errors",
    }),
  ).resolves.toBeUndefined();
  expect(
    JSON.parse(fetchMock.mock.calls[0]![1].body).input.masked_stack,
  ).toBeNull();
});

it("relays only approved fields for a same-origin browser report", async () => {
  const fetchMock = vi
    .fn()
    .mockResolvedValue(new Response(null, { status: 202 }));
  vi.stubGlobal("fetch", fetchMock);
  const request = new Request("https://blog.example/api/errors", {
    method: "POST",
    headers: {
      Origin: "https://blog.example",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      action: "error.capture",
      input: {
        app: "admin",
        source: "next_server",
        route: "/posts/:id",
        environment: "development",
        error_name: "Error",
        code: "render_boundary",
        digest: null,
        release: "client-spoofed",
        cookie: "secret",
      },
    }),
  });
  const response = await relayErrorReport(
    request,
    "web",
    "https://project.supabase.co",
    "server-only-key",
    "production",
    "server-r1",
  );
  expect(response.status).toBe(202);
  const sent = JSON.parse(fetchMock.mock.calls[0]![1].body);
  expect(sent.input.app).toBe("web");
  expect(sent.input.source).toBe("browser");
  expect(sent.input.environment).toBe("production");
  expect(sent.input.release).toBe("server-r1");
  expect(JSON.stringify(sent)).not.toContain("secret");
  expect(fetchMock.mock.calls[0]![1].headers["X-Error-Report-Key"]).toBe(
    "server-only-key",
  );
});

it("re-masks forged browser detail text at the server relay", async () => {
  const fetchMock = vi
    .fn()
    .mockResolvedValue(new Response(null, { status: 202 }));
  vi.stubGlobal("fetch", fetchMock);
  const request = new Request("https://blog.example/api/errors", {
    method: "POST",
    headers: {
      Origin: "https://blog.example",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      action: "error.capture",
      input: {
        error_name: "TypeError",
        code: "render_boundary",
        digest: null,
        route: "/posts/:id",
        masked_message: "Failed for private@example.com token=secret",
        masked_stack: "at fn (https://example.com/a?code=secret)",
      },
    }),
  });
  const response = await relayErrorReport(
    request,
    "web",
    "https://project.supabase.co",
    "server-key",
  );
  expect(response.status).toBe(202);
  const forwarded = JSON.parse(fetchMock.mock.calls[0]![1].body).input;
  expect(forwarded.masked_message).toContain("[email]");
  expect(forwarded.masked_stack).toContain("[url]");
  expect(JSON.stringify(forwarded)).not.toContain("secret");
});

it("rejects oversized browser reports before forwarding", async () => {
  const fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  const request = new Request("https://blog.example/api/errors", {
    method: "POST",
    headers: {
      Origin: "https://blog.example",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      action: "error.capture",
      input: { masked_stack: "x".repeat(17000) },
    }),
  });
  const response = await relayErrorReport(
    request,
    "web",
    "https://project.supabase.co",
    "server-key",
  );
  expect(response.status).toBe(400);
  expect(fetchMock).not.toHaveBeenCalled();
});

it("rejects cross-site posts before forwarding", async () => {
  const fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  const response = await relayErrorReport(
    new Request("https://blog.example/api/errors", {
      method: "POST",
      headers: {
        Origin: "https://other.example",
        "Content-Type": "application/json",
      },
      body: "{}",
    }),
    "web",
    "https://project.supabase.co",
    "server-only-key",
  );
  expect(response.status).toBe(403);
  expect(fetchMock).not.toHaveBeenCalled();
});
