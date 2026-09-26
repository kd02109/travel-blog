import { createServerTravelApi } from "@repo/api-client/server";
import { HomeContent } from "./home-content";

export const dynamic = "force-dynamic";

export default async function Home() {
  if (process.env.NEXT_PUBLIC_API_MOCKING === "enabled" && !process.env.TRAVEL_SSR_API_URL)
    return <HomeContent />;
  let initialSite;
  let initialPosts;
  try {
    const api = createServerTravelApi();
    initialSite = await api.getSite();
    initialPosts = await api.listPosts({ site_id: initialSite.id, limit: 6, offset: 0 });
  } catch {
    // The browser API can recover and display its own retry state.
  }
  return <HomeContent initialSite={initialSite} initialPosts={initialPosts} />;
}
