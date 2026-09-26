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
  let initialSite;
  let initialPosts;
  let initialError: string | undefined;
  try {
    const api = createServerTravelApi();
    initialSite = await api.getSite();
    initialPosts = await api.listPosts({ site_id: initialSite.id, category, tag, limit: 13, offset: (page - 1) * 12 });
  } catch {
    initialError = "공개 여행 기록을 불러오지 못했습니다. 연결을 확인한 뒤 다시 시도해 주세요.";
  }
  return (
    <Catalog
      key={`${page}-${category ?? "all"}-${tag ?? ""}`}
      initialSite={initialSite}
      initialPosts={initialPosts}
      initialPage={page}
      initialCategory={category}
      initialTag={tag}
      initialError={initialError}
    />
  );
}
