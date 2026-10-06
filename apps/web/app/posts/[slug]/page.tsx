import { notFound } from "next/navigation";
import { headers } from "next/headers";
import type { Metadata } from "next";
import { createServerTravelApi } from "@repo/api-client/server";
import { TravelApiError } from "@repo/api-client";
import { CATEGORIES } from "@repo/constants";
import { PostDetail } from "../post-detail";

export const dynamic = "force-dynamic";

function textPreview(html: string | null) {
  return (html ?? "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 160);
}

async function shareOrigin() {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (configured) return new URL(configured);
  const requestHeaders = await headers();
  const host = (
    requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host")
  )
    ?.split(",")[0]
    ?.trim();
  if (!host) return new URL("http://localhost:3000");
  const protocol = (requestHeaders.get("x-forwarded-proto") ?? "")
    .split(",")[0]
    ?.trim();
  const scheme =
    protocol === "http" || protocol === "https"
      ? protocol
      : /^(localhost|127\.0\.0\.1)(:|$)/.test(host)
        ? "http"
        : "https";
  return new URL(`${scheme}://${host}`);
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const canonical = `/posts/${encodeURIComponent(slug)}`;
  try {
    const api = createServerTravelApi();
    const site = await api.getSite();
    const post = await api.getPost({ site_id: site.id, slug });
    const category = CATEGORIES.find(
      (item) => item.code === post.category_code,
    );
    const region =
      typeof post.metadata.region === "string"
        ? post.metadata.region.trim()
        : "";
    const bodyDescription = textPreview(post.body_html);
    const description =
      (typeof post.metadata.description === "string" &&
        post.metadata.description.trim()) ||
      (bodyDescription && `${post.title} · ${bodyDescription}`.slice(0, 180)) ||
      `${region ? `${region}에서의 ` : ""}${category?.label ?? "여행"} 기록, ${post.title}.`;
    const origin = await shareOrigin();
    const image = new URL(`/og/${encodeURIComponent(slug)}`, origin).href;
    return {
      metadataBase: origin,
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
        modifiedTime: post.updated_at,
        images: [{ url: image, alt: `${post.title} 대표 이미지` }],
      },
      twitter: {
        card: "summary_large_image",
        title: post.title,
        description,
        images: [image],
      },
    };
  } catch {
    return {
      title: "여행 기록을 찾을 수 없어요",
      robots: { index: false, follow: false },
    };
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
  if (loadFailed)
    return (
      <PostDetail
        slug={slug}
        initialError="여행 기록을 불러오지 못했습니다. 연결을 확인한 뒤 다시 시도해 주세요."
      />
    );
  return (
    <PostDetail
      slug={slug}
      initialSite={initialSite}
      initialPost={initialPost}
    />
  );
}
