import { createServerTravelApi } from "@repo/api-client/server";
import { HomeContent } from "./home-content";

export const dynamic = "force-dynamic";

export default async function Home() {
  if (
    process.env.NEXT_PUBLIC_API_MOCKING === "enabled" &&
    !process.env.TRAVEL_SSR_API_URL
  )
    return <HomeContent />;
  let initialSite;
  let initialPosts;
  let initialFeatured;
  try {
    const api = createServerTravelApi();
    initialSite = await api.getSite();
    initialPosts = await api.listPosts({
      site_id: initialSite.id,
      limit: 6,
      offset: 0,
    });
    const featuredId = initialSite.settings.featured_post_id;
    if (
      typeof featuredId === "string" &&
      !initialPosts.some((post) => post.post_id === featuredId)
    ) {
      try {
        initialFeatured = await api.getPost({
          site_id: initialSite.id,
          id: featuredId,
        });
      } catch {
        // A withdrawn featured post falls back to the latest published post.
      }
    }
  } catch {
    // The browser API can recover and display its own retry state.
  }
  return (
    <HomeContent
      initialSite={initialSite}
      initialPosts={initialPosts}
      initialFeatured={initialFeatured}
    />
  );
}
