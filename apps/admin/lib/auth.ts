import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createServerDatabase } from "@repo/database/server";
import { createTravelApi, TravelApiError } from "@repo/api-client";

const expiredAuthCodes = new Set([
  "bad_jwt",
  "session_expired",
  "session_not_found",
  "refresh_token_not_found",
  "refresh_token_already_used",
  "user_not_found",
]);

function authFailure(error: { status?: number; code?: string }) {
  if (
    (error.code && expiredAuthCodes.has(error.code)) ||
    error.status === 401 ||
    error.status === 403
  )
    return { status: "unauthenticated", reason: "expired" } as const;
  return { status: "unavailable" } as const;
}

/** Resolve the current request's verified user and active site membership. */
export const getAdminAccess = cache(async () => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url || !process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY)
    return { status: "unavailable" } as const;

  try {
    const db = await createServerDatabase();
    // getSession only detects a missing session and supplies the bearer token.
    // Its embedded user object is not an authorization source.
    const { data: initial, error: sessionError } = await db.auth.getSession();
    if (sessionError) return authFailure(sessionError);
    if (!initial.session)
      return { status: "unauthenticated", reason: "missing" } as const;

    // getUser verifies the session with Supabase Auth on the server.
    const { data, error: userError } = await db.auth.getUser();
    if (userError) return authFailure(userError);
    const user = data.user;
    if (!user) return { status: "unauthenticated", reason: "expired" } as const;

    // A linked Kakao identity is required in addition to an active role.
    if (!user.identities?.some((identity) => identity.provider === "kakao"))
      return { status: "forbidden" } as const;

    // Read the token again in case getUser refreshed the session.
    const { data: current, error: tokenError } = await db.auth.getSession();
    if (tokenError) return authFailure(tokenError);
    const session = current.session;
    if (!session || session.user.id !== user.id)
      return { status: "unauthenticated", reason: "expired" } as const;

    const api = createTravelApi({
      baseURL: `${url}/functions/v1/travel-api`,
      getAccessToken: async () => session.access_token,
    });
    const [site, me] = await Promise.all([api.getSite(), api.getMe()]);
    // The API response must refer to the same user verified above.
    if (me.user_id !== user.id)
      return { status: "unauthenticated", reason: "expired" } as const;
    const membership = me.memberships.find(
      (item) =>
        item.site_id === site.id &&
        ["owner", "admin", "editor"].includes(item.role),
    );
    if (!membership) return { status: "forbidden" } as const;

    return { status: "authorized", user, site, me, membership, api } as const;
  } catch (error) {
    if (error instanceof TravelApiError && error.status === 401)
      return { status: "unauthenticated", reason: "expired" } as const;
    if (error instanceof TravelApiError && error.status === 403)
      return { status: "forbidden" } as const;
    return { status: "unavailable" } as const;
  }
});

export async function requireEditor() {
  const access = await getAdminAccess();
  if (access.status === "authorized") return access;
  if (access.status === "forbidden") redirect("/forbidden");
  if (access.status === "unavailable") redirect("/login?error=unavailable");
  redirect(access.reason === "expired" ? "/login?error=expired" : "/login");
}
