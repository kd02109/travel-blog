import { Suspense } from "react";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createTravelApi } from "@repo/api-client";
import { createServerDatabase } from "@repo/database/server";
import { AccountSettings } from "./settings";
import { AccountLoadError } from "./account-load-error";
import { AccountPageLoading } from "./account-skeleton";

async function AccountSiteContent({
  accessToken,
  email,
}: {
  accessToken: string;
  email: string;
}) {
  const api = createTravelApi({
    baseURL: `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/travel-api`,
    getAccessToken: async () => accessToken,
  });
  let siteId: string | undefined;
  try {
    siteId = (await api.getSite()).id;
  } catch {
    // Show a scoped connection error after the authentication check.
  }
  if (!siteId) return <AccountLoadError />;
  return <AccountSettings siteId={siteId} email={email} />;
}

export default async function AccountPage() {
  const db = await createServerDatabase();
  const { data: auth } = await db.auth.getUser();
  if (!auth.user) {
    const expired = (await headers()).get("x-travel-session-expired") === "1";
    redirect(
      expired
        ? "/?login=1&error=expired&next=%2Faccount"
        : "/?login=1&next=%2Faccount",
    );
  }
  const { data: session } = await db.auth.getSession();
  if (!session.session) redirect("/?login=1&error=expired&next=%2Faccount");
  return (
    <Suspense fallback={<AccountPageLoading />}>
      <AccountSiteContent
        accessToken={session.session.access_token}
        email={auth.user.email ?? ""}
      />
    </Suspense>
  );
}
