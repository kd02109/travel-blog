import { relayErrorReport } from "@repo/observability/relay";

export async function POST(request: Request) {
  if (process.env.NEXT_PUBLIC_ERROR_MONITORING_ENABLED !== "true")
    return new Response(null, { status: 503 });
  return relayErrorReport(
    request,
    "admin",
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.TRAVEL_ERROR_REPORT_KEY,
    process.env.NEXT_PUBLIC_DEPLOY_ENV ?? process.env.NODE_ENV,
    process.env.NEXT_PUBLIC_APP_RELEASE,
  );
}
