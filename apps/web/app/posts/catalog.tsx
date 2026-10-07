"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { ActionOutput } from "@repo/contracts";
import { createBrowserTravelApi } from "@repo/api-client/browser";
import { useTravelQuery } from "@repo/api-client/hooks";
import { pageOffset } from "@repo/api-client/query";
import { CATEGORIES, type CategoryCode } from "@repo/constants";
import { Button } from "@repo/ui/button";
import { Pagination } from "@repo/ui/pagination";
import { PostCard } from "../post-card";
import { PublicApiErrorState } from "../public-feedback";
import { CatalogEmpty } from "./catalog-empty";
import { CatalogSkeleton } from "./catalog-loading";
import styles from "./catalog.module.css";

export function Catalog({
  initialSite,
  initialPosts,
  initialPage = 1,
  initialCategory,
  initialError,
}: {
  initialSite?: ActionOutput<"site.get">;
  initialPosts?: ActionOutput<"posts.list">;
  initialPage?: number;
  initialCategory?: CategoryCode;
  initialError?: string;
}) {
  const api = useMemo(() => createBrowserTravelApi(), []);
  const [page, setPage] = useState(initialPage);
  const [category, setCategory] = useState<CategoryCode | "all">(
    initialCategory ?? "all",
  );
  useEffect(() => {
    const sync = () => {
      const params = new URLSearchParams(window.location.search);
      const nextPage = Math.max(
        1,
        Number.parseInt(params.get("page") ?? "1", 10) || 1,
      );
      const nextCategory = params.get("category");
      setPage(nextPage);
      setCategory(
        CATEGORIES.some((item) => item.code === nextCategory)
          ? (nextCategory as CategoryCode)
          : "all",
      );
    };
    window.addEventListener("popstate", sync);
    return () => window.removeEventListener("popstate", sync);
  }, []);
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
    {
      site_id: siteId,
      limit: 13,
      offset: pageOffset(page),
      category: category === "all" ? undefined : category,
    },
    { siteId, actor: "public" },
    {
      enabled: Boolean(site.data),
      initialData:
        page === initialPage && category === (initialCategory ?? "all")
          ? initialPosts
          : undefined,
      staleTime: 0,
    },
  );
  const visiblePosts = posts.data?.slice(0, 12) ?? [];
  const showInitialError =
    Boolean(initialError) &&
    (!site.data || !posts.data) &&
    !site.isFetching &&
    !posts.isFetching &&
    !site.error &&
    !posts.error;
  const siteFailure = !site.data && Boolean(site.error);
  const loadFailure =
    !posts.data && (siteFailure || Boolean(posts.error) || showInitialError);
  const catalogLoading = !posts.data && !loadFailure;
  const refreshError =
    posts.data && (posts.error ?? (site.data ? site.error : null));
  const retryContent = () => {
    if (!site.data || site.error) void site.refetch();
    if (site.data && (posts.error || !posts.data)) void posts.refetch();
  };
  function move(next: number) {
    setPage(next);
    const query = new URLSearchParams();
    if (next > 1) query.set("page", String(next));
    if (category !== "all") query.set("category", category);
    window.history.pushState(
      null,
      "",
      `/posts${query.size ? `?${query}` : ""}`,
    );
    window.scrollTo({ top: 0, behavior: "auto" });
  }
  function selectCategory(nextCategory: CategoryCode | "all") {
    setCategory(nextCategory);
    setPage(1);
    const query = new URLSearchParams();
    if (nextCategory !== "all") query.set("category", nextCategory);
    window.history.pushState(
      null,
      "",
      `/posts${query.size ? `?${query}` : ""}`,
    );
    window.scrollTo({ top: 0, behavior: "auto" });
  }
  return (
    <main className="mx-auto w-full max-w-[var(--content-max)] px-5 py-10 md:px-8 md:py-14 xl:px-16">
      <header>
        <p className={styles.eyebrow}>OUR TRAVEL JOURNAL</p>
        <h1 className={styles.pageTitle}>여행 기록</h1>
        <p className={styles.intro}>
          걸었던 길과 머문 장소를 천천히 다시 읽습니다.
        </p>
        <nav aria-label="여행 기록 분류" className={styles.categoryNav}>
          {([{ code: "all", label: "모든 여행" }, ...CATEGORIES] as const).map(
            (item) => (
              <button
                key={item.code}
                type="button"
                aria-pressed={category === item.code}
                data-selected={category === item.code}
                onClick={() => selectCategory(item.code)}
                className={styles.categoryButton}
              >
                {item.label}
              </button>
            ),
          )}
        </nav>
      </header>
      <div className={styles.catalogContent}>
        {loadFailure && (
          <PublicApiErrorState
            error={siteFailure ? site.error : (posts.error ?? initialError)}
            title={
              siteFailure
                ? "여행 기록에 연결하지 못했어요"
                : category === "all"
                  ? "여행 기록을 확인하지 못했어요"
                  : "이 분류의 기록을 확인하지 못했어요"
            }
            description={site.error || posts.error ? undefined : initialError}
            onRetry={retryContent}
            isRetrying={site.isFetching || posts.isFetching}
            size="tall"
          />
        )}
        {refreshError && (
          <PublicApiErrorState
            error={refreshError}
            title="여행 기록을 새로 확인하지 못했어요"
            onRetry={retryContent}
            isRetrying={site.isFetching || posts.isFetching}
            size="small"
          />
        )}
        {catalogLoading && <CatalogSkeleton />}
        {!loadFailure && visiblePosts.length > 0 && (
          <section aria-label="여행 기록 목록">
            <p className={styles.listNote} aria-live="polite">
              {page > 1 ? `${page}번째 페이지` : "최근 기록"} ·{" "}
              {visiblePosts.length}편
            </p>
            <ul
              className={
                visiblePosts.length === 1
                  ? styles.singlePostList
                  : styles.postList
              }
            >
              {visiblePosts.map((post) => (
                <PostCard
                  key={post.post_id}
                  post={post}
                  siteId={siteId}
                  featured={visiblePosts.length === 1}
                />
              ))}
            </ul>
          </section>
        )}
        {!loadFailure && posts.data?.length === 0 && (
          <CatalogEmpty
            title={
              page > 1
                ? "이 페이지에는 기록이 없어요"
                : category !== "all"
                  ? "이 길의 첫 기록을 준비하고 있어요"
                  : "아직 여행 기록이 없어요"
            }
            description={
              page > 1
                ? "첫 페이지로 돌아가 다른 여행 기록을 살펴보세요."
                : category !== "all"
                  ? "다른 여행을 먼저 읽거나, 조금 뒤에 다시 들러 주세요."
                  : "새로운 여행 이야기가 올라오면 이곳에서 읽을 수 있어요."
            }
            action={
              page > 1 ? (
                <Button onClick={() => move(1)}>
                  첫 페이지 보기 <span aria-hidden="true">↗</span>
                </Button>
              ) : category !== "all" ? (
                <Button onClick={() => selectCategory("all")}>
                  모든 여행 보기 <span aria-hidden="true">↗</span>
                </Button>
              ) : (
                <Button asChild>
                  <Link href="/">
                    홈으로 돌아가기 <span aria-hidden="true">↗</span>
                  </Link>
                </Button>
              )
            }
          />
        )}
        {posts.data && (page > 1 || posts.data.length > 12) && (
          <Pagination
            page={page}
            hasNextPage={posts.data.length > 12}
            busy={posts.isFetching}
            onPageChange={move}
          />
        )}
      </div>
    </main>
  );
}
