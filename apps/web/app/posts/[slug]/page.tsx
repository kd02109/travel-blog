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
  const api = createServerTravelApi();
  const site = await api.getSite();
  const post = await api.getPost({ site_id: site.id, slug }).catch((error) => {
    if (error instanceof TravelApiError && error.status === 404) notFound();
    throw error;
  });
  return <PostDetail slug={slug} initialSite={site} initialPost={post} />;
}
