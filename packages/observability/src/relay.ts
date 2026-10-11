import {
  errorRoute,
  maskErrorText,
  safeErrorDependency,
  safeErrorOperation,
  safeHttpStatus,
  safeOriginRequestId,
  sanitizeStackFrames,
  type ErrorService,
} from "./index";
import { COLLECTOR_TIMEOUT_MS } from "./transport";

async function readSmallJson(request: Request): Promise<unknown> {
  if (!request.headers.get("content-type")?.startsWith("application/json"))
    throw new Error("invalid_content_type");
  const reader = request.body?.getReader();
  if (!reader) throw new Error("invalid_body");
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 16384) {
      await reader.cancel();
      throw new Error("body_too_large");
    }
    chunks.push(value);
  }
  const buffer = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    buffer.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return JSON.parse(new TextDecoder().decode(buffer));
}

/** Same-origin browser relay: the shared secret stays in the server runtime. */
export async function relayErrorReport(
  request: Request,
  service: ErrorService,
  supabaseUrl: string | undefined,
  reportKey: string | undefined,
  deployEnvironment = "development",
  appRelease = "unknown",
): Promise<Response> {
  if (!supabaseUrl || !reportKey) return new Response(null, { status: 503 });
  const origin = request.headers.get("origin");
  if (!origin || origin !== new URL(request.url).origin)
    return new Response(null, { status: 403 });
  let payload: unknown;
  try {
    payload = await readSmallJson(request);
  } catch {
    return new Response(null, { status: 400 });
  }
  if (!payload || typeof payload !== "object")
    return new Response(null, { status: 400 });
  const { action, input } = payload as Record<string, unknown>;
  if (
    action !== "error.capture" ||
    !input ||
    typeof input !== "object" ||
    Array.isArray(input)
  )
    return new Response(null, { status: 400 });
  const data = input as Record<string, unknown>;
  // Drop all unknown client fields before the request reaches Supabase.
  const safeInput = {
    event_id: safeOriginRequestId(data.event_id) ?? crypto.randomUUID(),
    app: service,
    environment:
      deployEnvironment === "production" || deployEnvironment === "preview"
        ? deployEnvironment
        : "development",
    source: "browser",
    route: errorRoute(typeof data.route === "string" ? data.route : ""),
    error_name: data.error_name,
    code: data.code,
    digest: data.digest,
    release: /^[A-Za-z0-9._-]{1,80}$/.test(appRelease) ? appRelease : "unknown",
    masked_message: maskErrorText(data.masked_message, 1024),
    masked_stack: maskErrorText(data.masked_stack, 4096),
    stack_frames: sanitizeStackFrames(data.stack_frames),
    operation: safeErrorOperation(data.operation) ?? "unknown_error",
    dependency: safeErrorDependency(data.dependency) ?? "browser",
    http_status: safeHttpStatus(data.http_status),
    origin_request_id: safeOriginRequestId(data.origin_request_id),
  };
  const startedAt = performance.now();
  try {
    const response = await fetch(`${supabaseUrl}/functions/v1/travel-api`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Error-Report-Key": reportKey,
      },
      body: JSON.stringify({ action, input: safeInput }),
      cache: "no-store",
      signal: AbortSignal.timeout(COLLECTOR_TIMEOUT_MS),
    });
    if (!response.ok && response.status !== 429) {
      console.warn({
        event: "error_relay_failed",
        app: service,
        reason: "upstream_status",
        upstream_status: response.status,
        elapsed_ms: Math.round(performance.now() - startedAt),
      });
    }
    return new Response(null, {
      status: response.ok ? 202 : response.status === 429 ? 429 : 503,
      headers: {
        "Cache-Control": "no-store",
        ...(response.status === 429 && response.headers.get("retry-after")
          ? { "Retry-After": response.headers.get("retry-after")! }
          : {}),
      },
    });
  } catch (error) {
    // Never send monitoring failures back through captureException: that
    // would recurse. Do not log the exception, report body, headers or URL.
    console.warn({
      event: "error_relay_failed",
      app: service,
      reason:
        error instanceof Error && error.name === "TimeoutError"
          ? "timeout"
          : "network",
      elapsed_ms: Math.round(performance.now() - startedAt),
    });
    return new Response(null, { status: 503 });
  }
}
