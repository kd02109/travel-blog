/** Supabase secret API keys are API-key credentials, not JWT bearer tokens. */
export function workerApiKeyHeaders(apiKey: string): Record<string, string> {
  return apiKey.startsWith("sb_secret_")
    ? { apikey: apiKey }
    : { apikey: apiKey, Authorization: `Bearer ${apiKey}` };
}

/** Supabase JS adds its key as Authorization by default; strip only a new secret key. */
export function createWorkerFetch(
  apiKey: string,
  fetchImplementation: typeof fetch = fetch,
): typeof fetch {
  return (input, init) => {
    const headers = new Headers(init?.headers);
    if (apiKey.startsWith("sb_secret_")) {
      if (headers.get("Authorization") === `Bearer ${apiKey}`)
        headers.delete("Authorization");
      if (!headers.has("apikey")) headers.set("apikey", apiKey);
    }
    return fetchImplementation(input, { ...init, headers });
  };
}
