import { reportAdminError } from "./lib/error-monitor";

window.addEventListener("error", (event) => {
  void reportAdminError(
    event.error,
    "uncaught_error",
    "browser",
    window.location.pathname,
  );
});
window.addEventListener("unhandledrejection", (event) => {
  void reportAdminError(
    event.reason,
    "unhandled_rejection",
    "browser",
    window.location.pathname,
  );
});
