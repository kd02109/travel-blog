"use client";
import Link from "next/link";
import Image from "next/image";
import { useLayoutEffect, useMemo, useRef } from "react";
import type { ActionOutput } from "@repo/contracts";
import { CATEGORIES, SITE_NAME } from "@repo/constants";
import { createBrowserTravelApi } from "@repo/api-client/browser";
import { useTravelQuery } from "@repo/api-client/hooks";
import { Skeleton } from "@repo/ui/skeleton";
import {
  HomeCover,
  homeCoverActionClassName,
  homeDesignSamples,
  homeDesignSecondarySamples,
  resolveHomeTemplate,
} from "@repo/ui/home-cover";
import { AnalyticsConsent } from "./analytics-consent";
import { HomeHeroSkeleton } from "./home-loading";
import { PostCard, PostCardSkeleton } from "./post-card";
import { CatalogEmpty } from "./posts/catalog-empty";
import { PdfCover, PrivateImage } from "./posts/post-media";
import { PublicApiErrorState } from "./public-feedback";
import styles from "./home-content.module.css";

function HomeRecentSkeleton() {
  return (
    <div role="status" aria-label="최근 여행 기록을 불러오는 중">
      <span className="sr-only">최근 여행 기록을 불러오는 중입니다.</span>
      <div className={styles.latestStorySkeleton} aria-hidden="true">
        <Skeleton className={styles.latestSkeletonMedia} />
        <div className={styles.latestCopy}>
          <Skeleton className="h-3 w-2/5" />
          <Skeleton className="mt-7 h-8 w-5/6" />
          <Skeleton className="mt-3 h-8 w-3/4" />
          <Skeleton className="mt-5 h-3 w-1/2" />
          <Skeleton className="mt-auto h-3 w-1/3" />
        </div>
      </div>
      <div className="mt-12">
        <Skeleton className="h-6 w-40" />
        <ul className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 5 }, (_, index) => (
            <PostCardSkeleton key={index} />
          ))}
        </ul>
      </div>
    </div>
  );
}

function LatestStory({
  post,
  siteId,
}: {
  post: ActionOutput<"posts.list">[number];
  siteId: string;
}) {
  const category = CATEGORIES.find((item) => item.code === post.category_code);
  const metadata =
    post.metadata &&
    typeof post.metadata === "object" &&
    !Array.isArray(post.metadata)
      ? (post.metadata as Record<string, unknown>)
      : {};
  const region = typeof metadata.region === "string" ? metadata.region : "";
  const pdf = post.category_code === "itinerary-pdf";
  const coverAssetId = pdf ? post.pdf_asset_id : post.cover_asset_id;

  return (
    <Link
      href={`/posts/${encodeURIComponent(post.slug)}`}
      className={styles.latestStory}
    >
      <div className={styles.latestMedia}>
        {coverAssetId ? (
          pdf ? (
            <PdfCover
              assetId={coverAssetId}
              siteId={siteId}
              title={post.title}
              allowRetry={false}
            />
          ) : (
            <PrivateImage
              assetId={coverAssetId}
              siteId={siteId}
              title={`${post.title} 대표 사진`}
              className="h-full max-h-none w-full rounded-none object-cover"
              allowRetry={false}
            />
          )
        ) : (
          <span className={styles.latestNoImage} aria-hidden="true">
            <span>TRAVEL JOURNAL</span>
            <strong>01</strong>
            <span>{category?.label}</span>
          </span>
        )}
      </div>
      <div className={styles.latestCopy}>
        <span className={styles.latestEyebrow}>
          {[category?.label, region].filter(Boolean).join(" · ")}
        </span>
        <strong className={styles.latestTitle}>{post.title}</strong>
        <time dateTime={post.published_at} className={styles.latestDate}>
          {new Intl.DateTimeFormat("ko-KR", { dateStyle: "long" }).format(
            new Date(post.published_at),
          )}
        </time>
        <span className={styles.latestAction}>기록 읽기 ↗</span>
      </div>
    </Link>
  );
}

export function HomeContent({
  initialSite,
  initialPosts,
  initialFeatured,
  initialError,
}: {
  initialSite?: ActionOutput<"site.get">;
  initialPosts?: ActionOutput<"posts.list">;
  initialFeatured?: ActionOutput<"post.get">;
  initialError?: string;
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
    const snapPreference = window.matchMedia(
      "(min-width: 1024px) and (min-height: 700px)",
    );
    const syncSnap = () =>
      document.documentElement.classList.toggle(
        "travel-home-snap",
        snapPreference.matches,
      );
    syncSnap();
    snapPreference.addEventListener("change", syncSnap);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", syncTopOffset);
      snapPreference.removeEventListener("change", syncSnap);
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
    (!featuredId ? posts.data?.[0] : undefined);
  const retryContent = () => {
    if (!site.data || site.error) void site.refetch();
    if (site.data && (posts.error || !posts.data)) void posts.refetch();
  };
  const showInitialSiteError =
    Boolean(initialError) && !site.data && !site.isFetching && !site.error;
  const showInitialPostsError =
    Boolean(initialError) &&
    Boolean(site.data) &&
    !posts.data &&
    !posts.isFetching &&
    !posts.error;
  const siteFailure =
    !site.data && (Boolean(site.error) || showInitialSiteError);
  const siteLoading = !site.data && !siteFailure;
  const postsFailure =
    !posts.data &&
    (Boolean(posts.error) || showInitialPostsError || siteFailure);
  const postsLoading = !posts.data && !postsFailure;
  const refreshError =
    posts.data && (posts.error ?? (site.data ? site.error : null));
  const renderPhoto = (
    assetId: string | undefined,
    sample: { src: string; alt: string } | undefined,
    position: number,
  ) => {
    const tinyThumbnail = template === "D" && position > 1;
    return assetId && site.data ? (
      <div className={styles.heroImage}>
        <PrivateImage
          assetId={assetId}
          siteId={siteId}
          title={`우리의 여행 사진 ${position}`}
          eager={position === 1}
          allowRetry={!tinyThumbnail}
          compactError={tinyThumbnail}
          className={`h-full max-h-none w-full rounded-none object-cover ${tinyThumbnail ? "min-h-0" : "min-h-64"}`}
        />
      </div>
    ) : sample ? (
      <Image
        src={sample.src}
        alt={sample.alt}
        fill
        sizes="(max-width: 768px) 100vw, 70vw"
        loading={position === 1 ? "eager" : "lazy"}
        className="object-cover"
      />
    ) : undefined;
  };
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
  const coverAction = (
    <>
      {postsLoading ||
      (needsFeaturedLookup && !featuredDetail.data && !featuredDetail.error) ? (
        <span role="status" aria-label="대표 여행 기록을 확인하는 중">
          <span className="sr-only">대표 여행 기록을 확인하는 중입니다.</span>
          <Skeleton className="rounded-control mt-7 h-12 w-48" />
        </span>
      ) : featured ? (
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
      )}
      {needsFeaturedLookup && featuredDetail.error ? (
        <div className="mt-5 max-w-md">
          <PublicApiErrorState
            error={featuredDetail.error}
            title="대표 여행 기록을 확인하지 못했어요"
            onRetry={() => void featuredDetail.refetch()}
            isRetrying={featuredDetail.isFetching}
            size="small"
          />
        </div>
      ) : null}
    </>
  );

  return (
    <main ref={mainRef} className={styles.homeMain}>
      <div className={styles.heroScreen}>
        {siteFailure ? (
          <div className={styles.heroError}>
            <PublicApiErrorState
              error={site.error ?? initialError}
              title="여행 기록에 연결하지 못했어요"
              description={site.error ? undefined : initialError}
              onRetry={() => void site.refetch()}
              isRetrying={site.isFetching}
              size="tall"
            />
          </div>
        ) : siteLoading ? (
          <HomeHeroSkeleton />
        ) : (
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
        )}
      </div>
      <div id="home-journal" className={styles.journalScreen}>
        <div className="mx-auto w-full max-w-[var(--content-max)] px-5 md:px-8 xl:px-16">
          <section aria-labelledby="category-heading">
            <div className={styles.sectionHeading}>
              <div>
                <p className={styles.sectionEyebrow}>THE JOURNAL</p>
                <h2 id="category-heading">어떤 장면을 펼쳐 볼까요</h2>
              </div>
              <Link href="/posts">전체 기록 보기 ↗</Link>
            </div>
            <ul className={styles.categoryLine} aria-label="여행 기록 분류">
              {CATEGORIES.map((category, index) => (
                <li key={category.code}>
                  <Link href={`/posts?category=${category.code}`}>
                    <span className={styles.categoryNumber}>
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <strong>{category.label}</strong>
                    <span aria-hidden="true" className={styles.categoryArrow}>
                      ↗
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
          <section className="mt-12 lg:mt-16" aria-labelledby="latest-heading">
            <div className={styles.sectionHeading}>
              <div>
                <p className={styles.sectionEyebrow}>LATEST NOTE</p>
                <h2 id="latest-heading">새로 기록한 여행</h2>
              </div>
              <Link href="/posts">모두 보기</Link>
            </div>
            {postsFailure ? (
              <div className="mt-5">
                <PublicApiErrorState
                  error={posts.error ?? site.error ?? initialError}
                  title={
                    posts.error
                      ? "최근 여행 기록을 확인하지 못했어요"
                      : "최근 여행 기록을 불러오지 못했어요"
                  }
                  description={
                    posts.error || site.error ? undefined : initialError
                  }
                  onRetry={retryContent}
                  isRetrying={site.isFetching || posts.isFetching}
                />
              </div>
            ) : null}
            {refreshError ? (
              <div className="mt-5">
                <PublicApiErrorState
                  error={refreshError}
                  title={
                    posts.error
                      ? "최근 여행 기록을 새로 확인하지 못했어요"
                      : "사이트 정보를 새로 확인하지 못했어요"
                  }
                  onRetry={retryContent}
                  isRetrying={site.isFetching || posts.isFetching}
                  size="small"
                />
              </div>
            ) : null}
            {postsLoading ? (
              <div className="mt-5">
                <HomeRecentSkeleton />
              </div>
            ) : null}
            {posts.data?.length ? (
              <>
                <div className="mt-6">
                  <LatestStory post={posts.data[0]!} siteId={siteId} />
                </div>
                {posts.data.length > 1 && (
                  <div className="mt-12">
                    <h3 className="font-serif text-xl">이어서 읽을 기록</h3>
                    <ul className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                      {posts.data.slice(1).map((post) => (
                        <PostCard
                          key={post.post_id}
                          post={post}
                          siteId={siteId}
                        />
                      ))}
                    </ul>
                  </div>
                )}
              </>
            ) : posts.data ? (
              <div className="mt-6">
                <CatalogEmpty
                  title="첫 여행 기록을 준비하고 있어요"
                  description="기록이 올라오는 동안, 우리가 여행에서 간직하는 장면을 먼저 만나 보세요."
                  action={
                    <Link
                      href="/about"
                      className="rounded-control border-border hover:bg-muted inline-flex min-h-11 items-center border px-5 font-medium transition-colors"
                    >
                      우리의 기록 보기 ↗
                    </Link>
                  }
                />
              </div>
            ) : null}
          </section>
          <div className="mt-12">
            <AnalyticsConsent />
          </div>
        </div>
      </div>
    </main>
  );
}
