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

// Handled mutation/query failures do not reach window.error.
window.addEventListener("travel-api-unexpected-error", (event) => {
  const error = (event as CustomEvent<unknown>).detail;
  void reportAdminError(
    error,
    "api_failure",
    "browser",
    window.location.pathname,
    { dependency: "travel_api" },
  );
});
