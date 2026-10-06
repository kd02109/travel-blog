"use client";
import Link from "next/link";
import Image from "next/image";
import { useLayoutEffect, useMemo, useRef } from "react";
import type { ActionOutput } from "@repo/contracts";
import { CATEGORIES, SITE_NAME } from "@repo/constants";
import { createBrowserTravelApi } from "@repo/api-client/browser";
import { useTravelQuery } from "@repo/api-client/hooks";
import { ErrorState } from "@repo/ui/feedback";
import { LoadingState } from "@repo/ui/skeleton";
import {
  HomeCover,
  homeCoverActionClassName,
  homeDesignSamples,
  homeDesignSecondarySamples,
  resolveHomeTemplate,
} from "@repo/ui/home-cover";
import { AnalyticsConsent } from "./analytics-consent";
import { PostCard } from "./post-card";
import { PrivateImage } from "./posts/post-media";
import styles from "./home-content.module.css";

export function HomeContent({
  initialSite,
  initialPosts,
  initialFeatured,
}: {
  initialSite?: ActionOutput<"site.get">;
  initialPosts?: ActionOutput<"posts.list">;
  initialFeatured?: ActionOutput<"post.get">;
}) {
  const mainRef = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    const main = mainRef.current;
    const header = main?.parentElement?.previousElementSibling;
    const syncTopOffset = () => {
      if (main) {
        main.style.setProperty(
          "--home-top-offset",
          `${main.getBoundingClientRect().top + window.scrollY}px`,
        );
        main.style.setProperty(
          "--home-header-height",
          `${header?.getBoundingClientRect().height ?? 88}px`,
        );
      }
    };
    syncTopOffset();
    const observer = new ResizeObserver(syncTopOffset);
    if (header) observer.observe(header);
    window.addEventListener("resize", syncTopOffset);
    document.documentElement.classList.add("travel-home-snap");
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", syncTopOffset);
      document.documentElement.classList.remove("travel-home-snap");
    };
  }, []);

  const api = useMemo(() => createBrowserTravelApi(), []);
  const site = useTravelQuery(
    api,
    "site.get",
    { slug: "parents-travel" },
    { siteId: "lookup", actor: "public" },
    { initialData: initialSite, staleTime: 0 },
  );
  const siteId = site.data?.id ?? "00000000-0000-0000-0000-000000000000";
  const posts = useTravelQuery(
    api,
    "posts.list",
    { site_id: siteId, limit: 6, offset: 0 },
    { siteId, actor: "public" },
    { enabled: !!site.data, initialData: initialPosts, staleTime: 0 },
  );
  const settings = site.data?.settings as Record<string, unknown> | undefined;
  const template = resolveHomeTemplate(settings?.template_id);
  const legacyHeroAssetId =
    typeof settings?.hero_asset_id === "string" ? settings.hero_asset_id : "";
  const configuredImageIds = Array.isArray(settings?.hero_asset_ids)
    ? settings.hero_asset_ids
        .filter((id): id is string => typeof id === "string" && !!id)
        .slice(0, 4)
    : [];
  const heroAssetIds = configuredImageIds.length
    ? configuredImageIds
    : legacyHeroAssetId
      ? [legacyHeroAssetId]
      : [];
  const featuredId =
    typeof settings?.featured_post_id === "string"
      ? settings.featured_post_id
      : "";
  const recentFeatured = posts.data?.find(
    (post) => post.post_id === featuredId,
  );
  const needsFeaturedLookup =
    !!site.data && !!posts.data && !!featuredId && !recentFeatured;
  const featuredDetail = useTravelQuery(
    api,
    "post.get",
    { site_id: siteId, id: featuredId || siteId },
    { siteId, actor: "public" },
    {
      enabled: needsFeaturedLookup,
      initialData:
        initialFeatured?.post_id === featuredId ? initialFeatured : undefined,
      staleTime: 0,
    },
  );
  const featured =
    recentFeatured ??
    featuredDetail.data ??
    (needsFeaturedLookup && featuredDetail.isPending
      ? undefined
      : posts.data?.[0]);
  const renderPhoto = (
    assetId: string | undefined,
    sample: { src: string; alt: string } | undefined,
    position: number,
  ) =>
    assetId && site.data ? (
      <div className={styles.heroImage}>
        <PrivateImage
          assetId={assetId}
          siteId={siteId}
          title={`우리의 여행 사진 ${position}`}
          eager={template === "A" || position === 1}
          className="h-full max-h-none min-h-64 w-full rounded-none object-cover"
        />
      </div>
    ) : sample ? (
      <Image
        src={sample.src}
        alt={sample.alt}
        fill
        sizes="(max-width: 768px) 100vw, 70vw"
        loading={template === "A" || position === 1 ? "eager" : "lazy"}
        className="object-cover"
      />
    ) : undefined;
  const heroImage = renderPhoto(
    heroAssetIds[0],
    homeDesignSamples[template],
    1,
  );
  const secondarySamples = homeDesignSecondarySamples[template];
  const secondaryCount =
    template === "D" || heroAssetIds.length > 0
      ? Math.max(0, heroAssetIds.length - 1)
      : secondarySamples.length;
  const secondaryImages = Array.from({ length: secondaryCount }, (_, index) =>
    renderPhoto(
      heroAssetIds[index + 1],
      heroAssetIds.length > 0 ? undefined : secondarySamples[index],
      index + 2,
    ),
  );
  const secondarySampleImages = Array.from(
    { length: secondaryCount },
    () => heroAssetIds.length === 0,
  );
  const coverAction = featured ? (
    <Link
      href={"/posts/" + encodeURIComponent(featured.slug)}
      className={homeCoverActionClassName}
    >
      {featured.title} 읽기 ↗
    </Link>
  ) : (
    <Link href="/posts" className={homeCoverActionClassName}>
      이 여행 펼치기 ↗
    </Link>
  );

  return (
    <main ref={mainRef} className={styles.homeMain}>
      <div className={styles.heroScreen}>
        <HomeCover
          template={template}
          title={
            typeof settings?.title === "string" ? settings.title : undefined
          }
          description={
            typeof settings?.description === "string"
              ? settings.description
              : undefined
          }
          siteName={site.data?.name ?? SITE_NAME}
          image={heroImage}
          secondaryImages={secondaryImages}
          secondarySampleImages={secondarySampleImages}
          action={coverAction}
          sampleImage={!heroAssetIds[0]}
        />
      </div>
      <div id="home-journal" className={styles.journalScreen}>
        <div className="mx-auto w-full max-w-[var(--content-max)] px-5 md:px-8 xl:px-16">
          <section aria-labelledby="category-heading">
            <p className="text-muted-foreground text-sm font-medium tracking-wider">
              OUR TRAVEL JOURNAL
            </p>
            <h2
              id="category-heading"
              className="mt-2 font-serif text-2xl sm:text-3xl"
            >
              함께한 여행의 장면
            </h2>
            <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {CATEGORIES.map((category) => (
                <li key={category.code}>
                  <Link
                    href={`/posts?category=${category.code}`}
                    className="group rounded-panel border-border bg-surface hover:border-primary hover:bg-muted/50 flex min-h-36 flex-col justify-between border p-5 transition-colors focus-visible:relative sm:p-6"
                  >
                    <span className="text-muted-foreground text-sm">
                      TRAVEL JOURNAL
                    </span>
                    <span className="mt-5 flex items-center justify-between gap-3 font-serif text-xl sm:text-2xl">
                      <span>{category.label}</span>
                      <span
                        aria-hidden="true"
                        className="text-primary transition-transform group-hover:translate-x-1"
                      >
                        ↗
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
          <section className="mt-14" aria-labelledby="latest-heading">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="text-muted-foreground text-sm tracking-wider">
                  RECENT NOTES
                </p>
                <h2
                  id="latest-heading"
                  className="mt-2 font-serif text-2xl sm:text-3xl"
                >
                  새로 기록한 여행
                </h2>
              </div>
              <Link
                className="inline-flex min-h-12 items-center underline underline-offset-4"
                href="/posts"
              >
                모두 보기
              </Link>
            </div>
            {site.error || posts.error ? (
              <div className="mt-5">
                <ErrorState
                  description="여행 기록을 불러오지 못했습니다."
                  onRetry={() => {
                    void site.refetch();
                    void posts.refetch();
                  }}
                />
              </div>
            ) : !posts.data ? (
              <div className="mt-5">
                <LoadingState label="최근 여행 기록을 불러오고 있어요…" />
              </div>
            ) : posts.data.length ? (
              <ul className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                {posts.data.map((post) => (
                  <PostCard key={post.post_id} post={post} siteId={siteId} />
                ))}
              </ul>
            ) : (
              <p className="rounded-panel mt-5 border p-8 text-center">
                아직 공개된 여행 기록이 없습니다.
              </p>
            )}
          </section>
          <div className="mt-12">
            <AnalyticsConsent />
          </div>
        </div>
      </div>
    </main>
  );
}
