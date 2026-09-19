import "server-only";
import { redirect } from "next/navigation";
import { createServerDatabase } from "@repo/database/server";
import { createTravelApi } from "@repo/api-client";
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
  if (!user) redirect("/login");
  const {
    data: { session },
  } = await db.auth.getSession();
  if (!session) redirect("/login");
  const api = createTravelApi({
    baseURL: `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/travel-api`,
    getAccessToken: async () => session.access_token,
  });
  const [site, raw] = await Promise.all([api.getSite(), api.request("me")]);
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
