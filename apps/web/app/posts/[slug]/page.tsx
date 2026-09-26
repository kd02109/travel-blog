import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { createServerTravelApi } from "@repo/api-client/server";
import { TravelApiError } from "@repo/api-client";
import { PostDetail } from "../post-detail";
export const dynamic = "force-dynamic";
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const canonical = `/posts/${encodeURIComponent(slug)}`;
  try {
    const api = createServerTravelApi();
    const site = await api.getSite();
    const post = await api.getPost({ site_id: site.id, slug });
    const description = typeof post.metadata.description === "string"
      ? post.metadata.description
      : `${site.name}의 여행 기록입니다.`;
    const image = post.cover_asset_id || post.pdf_asset_id ? `/og/${encodeURIComponent(slug)}` : undefined;
    return {
      title: post.title,
      description,
      alternates: { canonical },
      openGraph: {
        type: "article",
        locale: "ko_KR",
        siteName: site.name,
        title: post.title,
        description,
        url: canonical,
        publishedTime: post.published_at,
        ...(image ? { images: [{ url: image, alt: post.title }] } : {}),
      },
      twitter: { card: image ? "summary_large_image" : "summary", title: post.title, description, ...(image ? { images: [image] } : {}) },
    };
  } catch {
    return { title: "여행 기록을 찾을 수 없어요", robots: { index: false, follow: false } };
  }
}
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
