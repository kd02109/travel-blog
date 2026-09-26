import { redirect } from "next/navigation";
import { createTravelApi } from "@repo/api-client";
import { createServerDatabase } from "@repo/database/server";
import { AccountSettings } from "./settings";

export default async function AccountPage() {
  const db = await createServerDatabase();
  const { data: auth } = await db.auth.getUser();
  if (!auth.user) redirect("/login?next=%2Faccount");
  const { data: session } = await db.auth.getSession();
  if (!session.session) redirect("/login?error=expired&next=%2Faccount");
  const api = createTravelApi({
    baseURL: `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/travel-api`,
    getAccessToken: async () => session.session!.access_token,
  });
  let site;
  try {
    site = await api.getSite();
  } catch {
    return (
      <main className="mx-auto max-w-2xl px-5 py-16">
        <h1 className="font-editorial text-3xl font-semibold">내 계정</h1>
        <p role="alert" className="mt-4">
          계정 정보를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.
        </p>
      </main>
    );
  }
  return <AccountSettings siteId={site.id} email={auth.user.email ?? ""} />;
}
