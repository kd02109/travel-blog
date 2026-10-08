import { reportWebError } from "./lib/error-monitor";

window.addEventListener("error", (event) => {
  void reportWebError(
    event.error,
    "uncaught_error",
    "browser",
    window.location.pathname,
  );
});
window.addEventListener("unhandledrejection", (event) => {
  void reportWebError(
    event.reason,
    "unhandled_rejection",
    "browser",
    window.location.pathname,
  );
});
