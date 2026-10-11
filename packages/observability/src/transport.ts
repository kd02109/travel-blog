// The browser must outlive the relay's upstream deadline, including route
// startup and the return trip. Telemetry stays bounded and is never retried:
// a timed-out capture may already have committed in the collector.
export const COLLECTOR_TIMEOUT_MS = 8000;
export const BROWSER_REPORT_TIMEOUT_MS = 12000;
