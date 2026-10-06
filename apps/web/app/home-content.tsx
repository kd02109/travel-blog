"use client";
import Link from "next/link";
import Image from "next/image";
import { useLayoutEffect, useMemo, useRef } from "react";
import type { ActionOutput } from "@repo/contracts";
import { CATEGORIES, SITE_NAME } from "@repo/constants";
import { createBrowserTravelApi } from "@repo/api-client/browser";
import { ApiErrorState } from "@repo/api-client/feedback";
import { useTravelQuery } from "@repo/api-client/hooks";
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
import { CatalogEmpty } from "./posts/catalog-empty";
import { PrivateImage } from "./posts/post-media";
import styles from "./home-content.module.css";

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
          eager={position === 1}
          className="h-full max-h-none min-h-64 w-full rounded-none object-cover"
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
      {featured ? (
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
          <ApiErrorState
            error={featuredDetail.error}
            title="대표 여행 기록을 확인하지 못했어요"
            onRetry={() => void featuredDetail.refetch()}
            isRetrying={featuredDetail.isFetching}
          />
        </div>
      ) : null}
    </>
  );

  return (
    <main ref={mainRef} className={styles.homeMain}>
      <div className={styles.heroScreen}>
        {(site.error && !site.data) || showInitialSiteError ? (
          <div className="mx-auto flex w-full max-w-2xl items-center px-5 py-16">
            <ApiErrorState
              error={site.error ?? initialError}
              title="여행 기록에 연결하지 못했어요"
              description={site.error ? undefined : initialError}
              onRetry={() => void site.refetch()}
              isRetrying={site.isFetching}
            />
          </div>
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
            <p className="text-muted-foreground text-sm font-medium tracking-wider">
              OUR TRAVEL JOURNAL
            </p>
            <h2
              id="category-heading"
              className="mt-2 font-serif text-2xl sm:text-3xl"
            >
              함께한 여행의 장면
            </h2>
            <ul className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-5">
              {CATEGORIES.map((category, index) => (
                <li
                  key={category.code}
                  className="last:col-span-2 lg:last:col-span-1"
                >
                  <Link
                    href={`/posts?category=${category.code}`}
                    className="group rounded-panel border-border bg-surface hover:border-primary hover:bg-muted/50 flex min-h-28 flex-col justify-between border p-4 transition-colors focus-visible:relative sm:min-h-32 sm:p-5"
                  >
                    <span className="text-muted-foreground text-xs tracking-[0.12em] tabular-nums">
                      {String(index + 1).padStart(2, "0")} /{" "}
                      {String(CATEGORIES.length).padStart(2, "0")}
                    </span>
                    <span className="mt-4 flex items-end justify-between gap-1 font-serif text-lg sm:text-xl xl:text-[1.4rem]">
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
            {posts.error ||
            (site.error && site.data) ||
            showInitialPostsError ? (
              <div className="mt-5">
                <ApiErrorState
                  error={posts.error ?? site.error ?? initialError}
                  title={
                    posts.error
                      ? "최근 여행 기록을 확인하지 못했어요"
                      : site.error
                        ? "사이트 정보를 새로 확인하지 못했어요"
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
            {!posts.data &&
            !site.error &&
            !posts.error &&
            !showInitialSiteError &&
            !showInitialPostsError ? (
              <div className="mt-5">
                <LoadingState label="최근 여행 기록을 불러오고 있어요…" />
              </div>
            ) : null}
            {posts.data?.length ? (
              <ul
                className={
                  posts.data.length === 1
                    ? `${styles.singlePostList} mt-6`
                    : "mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3"
                }
              >
                {posts.data.map((post) => (
                  <PostCard key={post.post_id} post={post} siteId={siteId} />
                ))}
              </ul>
            ) : posts.data && !posts.error ? (
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
