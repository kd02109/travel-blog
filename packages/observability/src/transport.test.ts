import { afterEach, expect, it, vi } from "vitest";
import { captureException } from "./index";
import { relayErrorReport } from "./relay";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

// Exercise the real AbortSignal deadlines. A resolved fetch mock would hide
// the failure seen when collection commits but its response takes >2.5 seconds.
function delayedResponse(signal: AbortSignal, delay: number) {
  return new Promise<Response>((resolve, reject) => {
    const abort = () => {
      clearTimeout(timer);
      reject(signal.reason);
    };
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", abort);
      resolve(new Response(null, { status: 202 }));
    }, delay);
    if (signal.aborted) abort();
    else signal.addEventListener("abort", abort, { once: true });
  });
}

function report() {
  return new Request("https://blog.example/api/errors", {
    method: "POST",
    headers: {
      Origin: "https://blog.example",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ action: "error.capture", input: {} }),
  });
}

it("acknowledges collection that completes after the former 2.5-second deadline", async () => {
  vi.stubGlobal("fetch", (_url: string, init: RequestInit) =>
    delayedResponse(init.signal!, 3200),
  );
  const response = await relayErrorReport(
    report(),
    "web",
    "https://project.supabase.co",
    "server-key",
  );
  expect(response.status).toBe(202);
}, 10000);

it("keeps the browser request alive through a delayed relay acknowledgement", async () => {
  let accepted = false;
  vi.stubGlobal("fetch", async (_url: string, init: RequestInit) => {
    const response = await delayedResponse(init.signal!, 3700);
    accepted = response.status === 202;
    return response;
  });
  await captureException(new Error("synthetic"), {
    service: "web",
    source: "browser",
    code: "render_boundary",
    route: "/",
    enabled: true,
    endpoint: "/api/errors",
  });
  expect(accepted).toBe(true);
}, 10000);

it("logs only bounded transport diagnostics when collection times out", async () => {
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.stubGlobal("fetch", () =>
    Promise.reject(
      new DOMException("private@example.com server-key", "TimeoutError"),
    ),
  );
  const response = await relayErrorReport(
    report(),
    "admin",
    "https://project.supabase.co",
    "server-key",
  );
  expect(response.status).toBe(503);
  expect(warn).toHaveBeenCalledWith(
    expect.objectContaining({
      event: "error_relay_failed",
      app: "admin",
      reason: "timeout",
      elapsed_ms: expect.any(Number),
    }),
  );
  expect(JSON.stringify(warn.mock.calls)).not.toMatch(
    /private@|server-key|supabase\.co/,
  );
});

it("terminates a collector that never acknowledges without retrying", async () => {
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  const fetchMock = vi.fn(
    (_url: string, init: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init.signal!.addEventListener(
          "abort",
          () => reject(init.signal!.reason),
          {
            once: true,
          },
        );
      }),
  );
  vi.stubGlobal("fetch", fetchMock);
  const response = await relayErrorReport(
    report(),
    "web",
    "https://project.supabase.co",
    "server-key",
  );
  expect(response.status).toBe(503);
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(warn).toHaveBeenCalledWith(
    expect.objectContaining({ reason: "timeout" }),
  );
}, 15000);
