const sharedHeaders = {
  "Access-Control-Allow-Headers":
    "authorization, apikey, content-type, x-client-info, x-visitor-token",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Expose-Headers": "Retry-After, X-Request-Id",
  Vary: "Origin",
};

export function parseAllowedOrigins(raw: string): Set<string> {
  const origins = new Set<string>();
  for (const entry of raw.split(",")) {
    const value = entry.trim();
    if (!value) continue;
    try {
      const url = new URL(value);
      const loopback =
        url.hostname === "localhost" || url.hostname === "127.0.0.1";
      if (
        value === url.origin &&
        !url.username &&
        !url.password &&
        !url.search &&
        !url.hash &&
        (url.protocol === "https:" || (url.protocol === "http:" && loopback))
      )
        origins.add(value);
    } catch {
      // Invalid entries never grant browser access.
    }
  }
  return origins;
}

export function corsOriginAllowed(
  origin: string | null,
  allowedOrigins: ReadonlySet<string>,
): boolean {
  return origin === null || allowedOrigins.has(origin);
}

export function corsHeaders(
  origin: string | null,
  allowedOrigins: ReadonlySet<string>,
): Record<string, string> {
  return origin && allowedOrigins.has(origin)
    ? { ...sharedHeaders, "Access-Control-Allow-Origin": origin }
    : { ...sharedHeaders };
}
