import { createServerTravelApi } from "@repo/api-client/server";
import { CATEGORIES, type CategoryCode } from "@repo/constants";
import { Catalog } from "./catalog";
export const dynamic = "force-dynamic";
export default async function Posts({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; category?: string; tag?: string }>;
}) {
  const params = await searchParams;
  const page = Math.min(
    8334,
    Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1),
  );
  const category = CATEGORIES.some((item) => item.code === params.category)
    ? (params.category as CategoryCode)
    : undefined;
  const tag = params.tag?.trim().slice(0, 30) || undefined;
  if (
    process.env.NEXT_PUBLIC_API_MOCKING === "enabled" &&
    !process.env.TRAVEL_SSR_API_URL
  )
    return <Catalog initialPage={page} initialCategory={category} initialTag={tag} />;
  const api = createServerTravelApi();
  const site = await api.getSite();
  const posts = await api.listPosts({
    site_id: site.id,
    category,
    tag,
    limit: 12,
    offset: (page - 1) * 12,
  });
  return (
    <Catalog
      key={`${page}-${category ?? "all"}-${tag ?? ""}`}
      initialSite={site}
      initialPosts={posts}
      initialPage={page}
      initialCategory={category}
      initialTag={tag}
    />
  );
}
