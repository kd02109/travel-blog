import type { ErrorEvent } from "@sentry/nextjs";
export function scrubEvent(event: ErrorEvent): ErrorEvent {
  delete event.user;
  delete event.extra;
  delete event.breadcrumbs;
  if (event.request) {
    delete event.request.cookies;
    delete event.request.headers;
    delete event.request.data;
    delete event.request.query_string;
    if (event.request.url)
      event.request.url = event.request.url.split(/[?#]/)[0];
  }
  return event;
}
export function sentryOptions(service: "web" | "admin", dsn?: string) {
  return {
    dsn,
    enabled: Boolean(dsn),
    sendDefaultPii: false,
    tracesSampleRate: 0,
    beforeSend: scrubEvent,
    initialScope: { tags: { service } },
  };
}
