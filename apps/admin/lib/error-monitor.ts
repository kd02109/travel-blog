import { captureException, type CaptureOptions } from "@repo/observability";

type DiagnosticHints = Pick<
  CaptureOptions,
  "operation" | "dependency" | "httpStatus" | "originRequestId"
>;

export function reportAdminError(
  error: unknown,
  code: string,
  source: "browser" | "next_server",
  route: string,
  hints: DiagnosticHints = {},
) {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  return captureException(error, {
    service: "admin",
    source,
    route,
    code,
    endpoint:
      source === "browser"
        ? "/api/errors"
        : base && process.env.TRAVEL_ERROR_REPORT_KEY
          ? `${base}/functions/v1/travel-api`
          : undefined,
    enabled:
      process.env.NEXT_PUBLIC_ERROR_MONITORING_ENABLED === "true" &&
      process.env.NEXT_PUBLIC_API_MOCKING !== "enabled",
    environment: process.env.NEXT_PUBLIC_DEPLOY_ENV ?? process.env.NODE_ENV,
    release: process.env.NEXT_PUBLIC_APP_RELEASE,
    reportKey:
      source === "next_server"
        ? process.env.TRAVEL_ERROR_REPORT_KEY
        : undefined,
    ...hints,
  });
}
