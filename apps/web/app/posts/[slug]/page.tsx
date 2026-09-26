import { notFound } from "next/navigation";
import { createServerTravelApi } from "@repo/api-client/server";
import { TravelApiError } from "@repo/api-client";
import { PostDetail } from "../post-detail";
export const dynamic = "force-dynamic";
export default async function Post({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  if (
    process.env.NEXT_PUBLIC_API_MOCKING === "enabled" &&
    !process.env.TRAVEL_SSR_API_URL
  )
    return <PostDetail slug={slug} />;
  let initialSite;
  let initialPost;
  let loadFailed = false;
  let missing = false;
  try {
    const api = createServerTravelApi();
    initialSite = await api.getSite();
    initialPost = await api.getPost({ site_id: initialSite.id, slug });
  } catch (error) {
    missing = error instanceof TravelApiError && error.status === 404;
    loadFailed = !missing;
  }
  if (missing) notFound();
  if (loadFailed) return <PostDetail slug={slug} initialError="여행 기록을 불러오지 못했습니다. 연결을 확인한 뒤 다시 시도해 주세요." />;
  return <PostDetail slug={slug} initialSite={initialSite} initialPost={initialPost} />;
}
