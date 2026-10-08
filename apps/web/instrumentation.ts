import type { Instrumentation } from "next";
import {
  errorRoute,
  originRequestIdFromError,
  safeOriginRequestId,
} from "@repo/observability";
import { reportWebError } from "./lib/error-monitor";

export const onRequestError: Instrumentation.onRequestError = async (
  error,
  request,
  context,
) => {
  const header =
    request.headers["x-travel-request-id"] ??
    request.headers["X-Travel-Request-Id"];
  const originRequestId =
    originRequestIdFromError(error) ??
    safeOriginRequestId(Array.isArray(header) ? header[0] : header);
  if (
    originRequestId &&
    process.env.NEXT_PUBLIC_ERROR_MONITORING_ENABLED === "true"
  ) {
    console.info(
      JSON.stringify({
        event: "next_request_error",
        origin_request_id: originRequestId,
        route: errorRoute(context.routePath),
        code: `next_${context.routeType}`,
      }),
    );
  }
  await reportWebError(
    error,
    `next_${context.routeType}`,
    "next_server",
    context.routePath,
    {
      originRequestId: originRequestId ?? undefined,
      dependency: "next_server",
    },
  );
};
