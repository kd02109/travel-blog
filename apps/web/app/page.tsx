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
  let initialError: string | undefined;
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
    initialError =
      "여행 기록을 불러오지 못했습니다. 연결을 확인한 뒤 다시 시도해 주세요.";
  }
  return (
    <HomeContent
      initialSite={initialSite}
      initialPosts={initialPosts}
      initialFeatured={initialFeatured}
      initialError={initialError}
    />
  );
}
