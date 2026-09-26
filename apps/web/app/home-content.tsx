"use client";
import Link from "next/link";
import { useMemo } from "react";
import type { ActionOutput } from "@repo/contracts";
import { CATEGORIES, SITE_NAME } from "@repo/constants";
import { createBrowserTravelApi } from "@repo/api-client/browser";
import { useTravelQuery } from "@repo/api-client/hooks";
import { ErrorState } from "@repo/ui/feedback";
import { LoadingState } from "@repo/ui/skeleton";
import { AnalyticsConsent } from "./analytics-consent";
import { PostCard } from "./post-card";
import { PrivateImage } from "./posts/post-media";

export function HomeContent({ initialSite, initialPosts }: {
  initialSite?: ActionOutput<"site.get">;
  initialPosts?: ActionOutput<"posts.list">;
}) {
  const api = useMemo(() => createBrowserTravelApi(), []);
  const site = useTravelQuery(api, "site.get", { slug: "parents-travel" }, { siteId: "lookup", actor: "public" }, { initialData: initialSite });
  const siteId = site.data?.id ?? "00000000-0000-0000-0000-000000000000";
  const posts = useTravelQuery(api, "posts.list", { site_id: siteId, limit: 6, offset: 0 }, { siteId, actor: "public" }, { enabled: !!site.data, initialData: initialPosts });
  const settings = site.data?.settings as Record<string, unknown> | undefined;
  const template = ["A", "B", "C", "D"].includes(String(settings?.template_id)) ? String(settings?.template_id) : "D";
  const heroAssetId = typeof settings?.hero_asset_id === "string" ? settings.hero_asset_id : "";
  const featured = posts.data?.find((post) => post.post_id === settings?.featured_post_id) ?? posts.data?.[0];
  const heroImage = heroAssetId && site.data ? <PrivateImage assetId={heroAssetId} siteId={siteId} title="우리의 여행 표지 사진" className="h-full min-h-64 w-full max-h-none rounded-none object-cover" /> : <div aria-label="대표 여행 사진을 준비하고 있어요" className="h-full min-h-64 w-full bg-[radial-gradient(ellipse_at_70%_25%,rgb(255_255_255_/_90%),transparent_22%),linear-gradient(165deg,#d8e2d8_0%,#b9d1cf_38%,#88a9a2_39%,#d9ded1_70%,#f4eee2_100%)]" role="img"><span className="rounded-control bg-surface/90 text-muted-foreground m-4 inline-flex px-3 py-2 text-sm">대표 여행 사진을 준비하고 있어요</span></div>;
  const heroCopy = <div className="rounded-postcard border-border bg-background relative z-10 border p-6 shadow-[0_12px_32px_rgb(23_60_66_/_14%)] sm:p-10 lg:p-12"><p className="text-muted-foreground text-sm font-medium tracking-[0.16em]">POSTCARD / 오늘의 여행</p><h1 id="postcard-title" className="mt-5 font-serif text-[clamp(2rem,5vw,3rem)] leading-[1.35]">{typeof settings?.title === "string" && settings.title ? settings.title : <>천천히 머물고,<br className="hidden sm:block" /> 오래 기억하는 여행</>}</h1><p className="text-muted-foreground mt-5 max-w-md text-base leading-relaxed">{typeof settings?.description === "string" && settings.description ? settings.description : `${site.data?.name ?? SITE_NAME}의 여행책을 한 장씩 펼쳐 보세요.`}</p>{featured ? <Link href={`/posts/${encodeURIComponent(featured.slug)}`} className="rounded-control bg-primary text-primary-foreground mt-7 inline-flex min-h-12 items-center justify-center px-6 text-base font-medium transition-colors hover:bg-[var(--primary-hover)]">{featured.title} 읽기 ↗</Link> : <Link href="/posts" className="rounded-control bg-primary text-primary-foreground mt-7 inline-flex min-h-12 items-center justify-center px-6 text-base font-medium">이 여행 펼치기 ↗</Link>}</div>;

  return (
    <main className="mx-auto w-full max-w-[var(--content-max)] px-5 py-10 md:px-8 md:py-16 xl:px-16">
      {template === "D" ? <section aria-labelledby="postcard-title" className="rounded-panel border-border bg-surface relative grid min-h-[min(68vh,640px)] items-end overflow-hidden border p-4 sm:min-h-[540px] sm:p-8 lg:grid-cols-[1.2fr_0.8fr] lg:items-center lg:p-12"><div className="rounded-postcard absolute inset-4 overflow-hidden sm:inset-8">{heroImage}</div><div className="mb-2 sm:mb-5 sm:ml-auto sm:max-w-xl lg:col-start-2 lg:row-start-1 lg:my-10 lg:mr-2">{heroCopy}</div></section>
        : template === "A" ? <section aria-labelledby="postcard-title" className="grid min-h-[min(68vh,640px)] gap-5 rounded-panel border p-4 sm:p-8 lg:grid-cols-[0.8fr_1.2fr] lg:items-center lg:gap-10 lg:p-12"><div className="min-h-72 overflow-hidden rounded-postcard sm:min-h-96">{heroImage}</div>{heroCopy}</section>
          : template === "B" ? <section aria-labelledby="postcard-title" className="grid min-h-[min(68vh,640px)] gap-5 rounded-panel border border-[#173c42] bg-[#173c42] p-4 sm:p-8 lg:grid-cols-[1.2fr_0.8fr] lg:items-center lg:gap-8 lg:p-12"><div className="min-h-72 overflow-hidden rounded-postcard sm:min-h-96">{heroImage}</div><div className="[&_h1]:text-white [&_p]:text-white/75">{heroCopy}</div></section>
            : <section aria-labelledby="postcard-title" className="grid min-h-[min(68vh,640px)] gap-5 rounded-panel border bg-[#e8ece3] p-4 sm:p-8 lg:grid-cols-[0.7fr_1.3fr] lg:items-center lg:gap-10 lg:p-12"><div className="lg:order-2">{heroCopy}</div><div className="min-h-72 overflow-hidden rounded-postcard sm:min-h-96 lg:order-1">{heroImage}</div></section>}
      <section className="mt-12 sm:mt-16" aria-labelledby="category-heading">
        <p className="text-muted-foreground text-sm font-medium tracking-wider">OUR TRAVEL JOURNAL</p>
        <h2 id="category-heading" className="mt-2 font-serif text-2xl sm:text-3xl">함께한 여행의 장면</h2>
        <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{CATEGORIES.map((category) => <li key={category.code}><Link href={`/posts?category=${category.code}`} className="group rounded-panel border-border bg-surface hover:border-primary hover:bg-muted/50 flex min-h-36 flex-col justify-between border p-5 transition-colors focus-visible:relative sm:p-6"><span className="text-muted-foreground text-sm">TRAVEL JOURNAL</span><span className="mt-5 flex items-center justify-between gap-3 font-serif text-xl sm:text-2xl"><span>{category.label}</span><span aria-hidden="true" className="text-primary transition-transform group-hover:translate-x-1">↗</span></span></Link></li>)}</ul>
      </section>
      <section className="mt-14" aria-labelledby="latest-heading"><div className="flex flex-wrap items-end justify-between gap-3"><div><p className="text-muted-foreground text-sm tracking-wider">RECENT NOTES</p><h2 id="latest-heading" className="mt-2 font-serif text-2xl sm:text-3xl">새로 기록한 여행</h2></div><Link className="min-h-12 inline-flex items-center underline underline-offset-4" href="/posts">모두 보기</Link></div>
        {site.error || posts.error ? <div className="mt-5"><ErrorState description="여행 기록을 불러오지 못했습니다." onRetry={() => { void site.refetch(); void posts.refetch(); }} /></div> : !posts.data ? <div className="mt-5"><LoadingState label="최근 여행 기록을 불러오고 있어요…" /></div> : posts.data.length ? <ul className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{posts.data.map((post) => <PostCard key={post.post_id} post={post} siteId={siteId} />)}</ul> : <p className="mt-5 rounded-panel border p-8 text-center">아직 공개된 여행 기록이 없습니다.</p>}
      </section>
      <div className="mt-12"><AnalyticsConsent /></div>
    </main>
  );
}
