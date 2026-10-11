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

// Handled mutation/query failures do not reach window.error.
window.addEventListener("travel-api-unexpected-error", (event) => {
  const error = (event as CustomEvent<unknown>).detail;
  void reportWebError(
    error,
    "api_failure",
    "browser",
    window.location.pathname,
    { dependency: "travel_api" },
  );
});
