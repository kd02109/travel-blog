import "server-only";
import { redirect } from "next/navigation";
import { createServerDatabase } from "@repo/database/server";
import { createTravelApi, TravelApiError } from "@repo/api-client";
import { membershipSchema } from "@repo/contracts";
export async function requireEditor() {
  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  )
    redirect("/login");
  const db = await createServerDatabase();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) redirect("/login?error=expired");
  const {
    data: { session },
  } = await db.auth.getSession();
  if (!session) redirect("/login?error=expired");
  const api = createTravelApi({
    baseURL: `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/travel-api`,
    getAccessToken: async () => session.access_token,
  });
  const result = await Promise.all([api.getSite(), api.request("me")]).catch(
    (error: unknown) => {
      if (error instanceof TravelApiError && error.status === 401)
        redirect("/login?error=expired");
      if (error instanceof TravelApiError && error.status === 403)
        redirect("/forbidden");
      redirect("/login?error=unavailable");
    },
  );
  const [site, raw] = result;
  const me = membershipSchema.parse(raw);
  if (
    !me.memberships.some(
      (m) =>
        m.site_id === site.id && ["owner", "admin", "editor"].includes(m.role),
    )
  )
    redirect("/forbidden");
  return { user, site, api };
}
