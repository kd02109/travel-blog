import * as Sentry from "@sentry/nextjs";
import { sentryOptions } from "@repo/observability";
Sentry.init(sentryOptions("web", process.env.NEXT_PUBLIC_SENTRY_DSN));
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
