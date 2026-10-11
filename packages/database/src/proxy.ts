import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "./types";
export async function refreshSession(request: NextRequest, requestId?: string) {
  let sessionExpired = false;
  const hadSessionCookie = request.cookies
    .getAll()
    .some(
      ({ name, value }) => value && /^sb-.*-auth-token(?:\.\d+)?$/.test(name),
    );
  const nextResponse = () => {
    const headers = new Headers(request.headers);
    // This is server-generated feedback, never an authorization source.
    headers.delete("x-travel-session-expired");
    if (sessionExpired) headers.set("x-travel-session-expired", "1");
    if (requestId) headers.set("x-travel-request-id", requestId);
    return NextResponse.next({ request: { headers } });
  };
  let response = nextResponse();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return response;
  const client = createServerClient<Database>(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(values) {
        values.forEach(({ name, value }) => request.cookies.set(name, value));
        response = nextResponse();
        values.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
        response.headers.set("Cache-Control", "private, no-store");
      },
    },
  });
  const { error } = await client.auth.getUser();
  sessionExpired = Boolean(
    hadSessionCookie &&
    error &&
    (error.status === 401 ||
      error.status === 403 ||
      [
        "bad_jwt",
        "session_expired",
        "session_not_found",
        "refresh_token_not_found",
        "refresh_token_already_used",
        "user_not_found",
      ].includes(error.code ?? "")),
  );
  if (sessionExpired) {
    const refreshed = nextResponse();
    response.cookies
      .getAll()
      .forEach((cookie) => refreshed.cookies.set(cookie));
    response = refreshed;
  }
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}
