import { timingSafeEqual } from "node:crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// The Supabase processing lease is five minutes. Leave a minute for expiry
// and retry if the platform terminates an invocation.
export const maxDuration = 240;

const responseHeaders = {
  "Cache-Control": "no-store",
  "X-Robots-Tag": "noindex, nofollow",
};

function authorized(header: string | null, secret: string | undefined) {
  if (!secret || secret.length < 32 || !header) return false;
  const expected = Buffer.from(`Bearer ${secret}`);
  const received = Buffer.from(header);
  return (
    received.length === expected.length && timingSafeEqual(received, expected)
  );
}

export async function GET(request: Request) {
  if (
    !authorized(request.headers.get("authorization"), process.env.CRON_SECRET)
  ) {
    return new Response(null, { status: 401, headers: responseHeaders });
  }
  if (process.env.TRAVEL_MEDIA_WORKER_ENABLED !== "true") {
    return new Response(null, { status: 503, headers: responseHeaders });
  }

  try {
    // Import only after authentication. This module includes native PDF/image
    // dependencies and is never loaded by an unauthenticated request.
    const { createMediaWorkerFromEnv } =
      await import("@repo/media-worker/processor");
    const result = await createMediaWorkerFromEnv().runTick();
    console.info(JSON.stringify({ event: "media_worker_tick", ...result }));
    return Response.json(result, { headers: responseHeaders });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    const code = /^(?:remote_[0-9]{3}|[a-z][a-z0-9_]{0,63})$/.test(message)
      ? message
      : "unknown";
    console.error(JSON.stringify({ event: "media_worker_tick_failed", code }));
    return new Response(null, { status: 503, headers: responseHeaders });
  }
}

export function HEAD() {
  return new Response(null, { status: 405, headers: responseHeaders });
}
