import { redirect } from "next/navigation";
import { createTravelApi } from "@repo/api-client";
import { createServerDatabase } from "@repo/database/server";
import { AccountSettings } from "./settings";
import { AccountLoadError } from "./account-load-error";

export default async function AccountPage() {
  const db = await createServerDatabase();
  const { data: auth } = await db.auth.getUser();
  if (!auth.user) redirect("/?login=1&next=%2Faccount");
  const { data: session } = await db.auth.getSession();
  if (!session.session) redirect("/?login=1&error=expired&next=%2Faccount");
  const api = createTravelApi({
    baseURL: `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/travel-api`,
    getAccessToken: async () => session.session!.access_token,
  });
  let site;
  try {
    site = await api.getSite();
  } catch {
    return <AccountLoadError />;
  }
  return <AccountSettings siteId={site.id} email={auth.user.email ?? ""} />;
}
