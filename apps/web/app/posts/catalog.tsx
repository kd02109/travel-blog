"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { ActionOutput } from "@repo/contracts";
import { createBrowserTravelApi } from "@repo/api-client/browser";
import { useTravelQuery } from "@repo/api-client/hooks";
import { ApiErrorState } from "@repo/api-client/feedback";
import { pageOffset } from "@repo/api-client/query";
import { CATEGORIES, type CategoryCode } from "@repo/constants";
import { Button } from "@repo/ui/button";
import { Pagination } from "@repo/ui/pagination";
import { LoadingState } from "@repo/ui/skeleton";
import { PostCard } from "../post-card";
import { CatalogEmpty } from "./catalog-empty";
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
  const loadError = site.error ?? posts.error;
  const showInitialError =
    Boolean(initialError) &&
    (!site.data || !posts.data) &&
    !site.isFetching &&
    !posts.isFetching &&
    !loadError;
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
        <p className="text-muted-foreground text-sm">OUR TRAVEL JOURNAL</p>
        <h1 className="mt-2 font-serif text-3xl sm:text-4xl">여행 기록</h1>
        <nav aria-label="여행 기록 분류" className="mt-7 flex flex-wrap gap-2">
          {([{ code: "all", label: "모든 여행" }, ...CATEGORIES] as const).map(
            (item) => (
              <button
                key={item.code}
                type="button"
                aria-pressed={category === item.code}
                onClick={() => selectCategory(item.code)}
                className={`rounded-control focus-visible:outline-ring border-border bg-surface text-foreground hover:bg-muted inline-flex min-h-11 items-center border px-4 py-2 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 ${category === item.code ? "font-semibold" : "font-normal"}`}
              >
                {item.label}
              </button>
            ),
          )}
        </nav>
      </header>
      <div className="mt-8 space-y-6">
        {(loadError || showInitialError) && (
          <ApiErrorState
            error={loadError ?? initialError}
            title="공개 기록을 확인하지 못했어요"
            description={loadError ? undefined : initialError}
            onRetry={retryContent}
            isRetrying={site.isFetching || posts.isFetching}
          />
        )}
        {!loadError &&
          !showInitialError &&
          (site.isPending || posts.isPending) && (
            <LoadingState label="여행 기록을 불러오고 있어요…" />
          )}
        {posts.data && posts.data.length > 0 && (
          <ul
            className={
              posts.data.length === 1
                ? styles.singlePostList
                : "grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
            }
          >
            {posts.data.slice(0, 12).map((post) => (
              <PostCard key={post.post_id} post={post} siteId={siteId} />
            ))}
          </ul>
        )}
        {posts.data?.length === 0 && !posts.error && (
          <CatalogEmpty
            title={
              category !== "all"
                ? "이 분류에는 아직 글이 없어요"
                : "아직 여행 기록이 없어요"
            }
            description={
              category !== "all"
                ? "다른 분류를 선택하거나 모든 여행을 살펴보세요."
                : "새로운 여행 이야기가 올라오면 이곳에서 읽을 수 있어요."
            }
            action={
              category !== "all" ? (
                <Button variant="outline" onClick={() => selectCategory("all")}>
                  모든 여행 보기
                </Button>
              ) : (
                <Button asChild variant="outline">
                  <Link href="/">홈으로 돌아가기</Link>
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
