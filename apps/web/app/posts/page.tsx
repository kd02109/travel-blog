import { createServerTravelApi } from "@repo/api-client/server";
import { Catalog } from "./catalog";
export const dynamic = "force-dynamic";
export default async function Posts({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const params = await searchParams;
  const page = Math.min(
    8334,
    Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1),
  );
  if (
    process.env.NEXT_PUBLIC_API_MOCKING === "enabled" &&
    !process.env.TRAVEL_SSR_API_URL
  )
    return <Catalog initialPage={page} />;
  const api = createServerTravelApi();
  const site = await api.getSite();
  const posts = await api.listPosts({
    site_id: site.id,
    limit: 12,
    offset: (page - 1) * 12,
  });
  return (
    <Catalog
      key={page}
      initialSite={site}
      initialPosts={posts}
      initialPage={page}
    />
  );
}
