import "server-only";
import { handleErrorEmails } from "../../../../lib/error-email";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(request: Request) {
  return handleErrorEmails(request, process.env);
}

// Prevent Next's implicit HEAD from performing a send.
export function HEAD() {
  return new Response(null, {
    status: 405,
    headers: { "Cache-Control": "no-store" },
  });
}
