import { TravelApiError } from "./errors";
type Session = { access_token: string; expires_at?: number };
type Auth = {
  getSession(): Promise<{ data: { session: Session | null }; error: unknown }>;
  refreshSession(): Promise<{
    data: { session: Session | null };
    error: unknown;
  }>;
};
/** No copied JWT cache: resolve the current Supabase session on every request. */
export function createSessionTokenProvider(auth: Auth, now = Date.now) {
  let refreshing: Promise<string> | undefined;
  return async () => {
    const result = await auth.getSession();
    if (result.error) throw new TravelApiError(401, "invalid_session");
    const session = result.data.session;
    if (!session) return undefined;
    if (session.expires_at && session.expires_at * 1000 <= now() + 60000) {
      if (!refreshing)
        refreshing = auth
          .refreshSession()
          .then((result) => {
            if (result.error || !result.data.session)
              throw new TravelApiError(401, "session_expired");
            return result.data.session.access_token;
          })
          .finally(() => {
            refreshing = undefined;
          });
      return refreshing;
    }
    return session.access_token;
  };
}
/** A visitor identity is tab-scoped for reload-stable likes, expires at the
 * server timestamp, and is discarded on invalid_visitor. Never log its token. */
export function createVisitorTokenProvider(
  issue: () => Promise<{ visitor_token: string; expires_at: number }>,
  now = Date.now,
  storage?: Pick<Storage, "getItem" | "setItem" | "removeItem">,
) {
  let current: { visitor_token: string; expires_at: number } | undefined;
  let pending: Promise<string> | undefined;
  return {
    clear() {
      current = undefined;
      try {
        storage?.removeItem("travel-visitor-token");
      } catch {
        // Fall back to the in-memory visitor when session storage is unavailable.
      }
    },
    async get() {
      if (!current && storage) {
        try {
          const stored = storage.getItem("travel-visitor-token");
          if (stored) {
            const parsed = JSON.parse(stored) as {
              visitor_token?: unknown;
              expires_at?: unknown;
            };
            if (
              typeof parsed.visitor_token === "string" &&
              typeof parsed.expires_at === "number" &&
              parsed.expires_at * 1000 > now() + 30000
            ) {
              current = {
                visitor_token: parsed.visitor_token,
                expires_at: parsed.expires_at,
              };
            } else storage.removeItem("travel-visitor-token");
          }
        } catch {
          current = undefined;
        }
      }
      if (current && current.expires_at * 1000 > now() + 30000)
        return current.visitor_token;
      if (!pending)
        pending = issue()
          .then((value) => {
            if (
              !value.visitor_token ||
              value.expires_at * 1000 <= now() + 30000
            )
              throw new TravelApiError(401, "invalid_visitor");
            current = value;
            try {
              storage?.setItem("travel-visitor-token", JSON.stringify(value));
            } catch {
              // Continue with the in-memory token if storage is blocked.
            }
            return value.visitor_token;
          })
          .finally(() => {
            pending = undefined;
          });
      return pending;
    },
  };
}
