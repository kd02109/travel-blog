"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import type { ActionOutput } from "@repo/contracts";
import { createBrowserTravelApi } from "@repo/api-client/browser";
import { useTravelQuery } from "@repo/api-client/hooks";
import { errorMessage } from "@repo/api-client";
import { pageOffset } from "@repo/api-client/query";
import { CATEGORIES, type CategoryCode } from "@repo/constants";
import { Button } from "@repo/ui/button";
import { Select } from "@repo/ui/select";
import { Pagination } from "@repo/ui/pagination";
import { EmptyState, ErrorState } from "@repo/ui/feedback";
import { LoadingState } from "@repo/ui/skeleton";
export function Catalog({
  initialSite,
  initialPosts,
  initialPage = 1,
  initialCategory,
}: {
  initialSite?: ActionOutput<"site.get">;
  initialPosts?: ActionOutput<"posts.list">;
  initialPage?: number;
  initialCategory?: CategoryCode;
}) {
  const api = useMemo(() => createBrowserTravelApi(), []);
  const [page, setPage] = useState(initialPage);
  const [category, setCategory] = useState<CategoryCode | "all">(
    initialCategory ?? "all",
  );
  const site = useTravelQuery(
    api,
    "site.get",
    { slug: "parents-travel" },
    { siteId: "lookup", actor: "public" },
    { initialData: initialSite },
  );
  const siteId = site.data?.id ?? "00000000-0000-0000-0000-000000000000";
  const posts = useTravelQuery(
    api,
    "posts.list",
    {
      site_id: siteId,
      limit: 12,
      offset: pageOffset(page),
      category: category === "all" ? undefined : category,
    },
    { siteId, actor: "public" },
    {
      enabled: Boolean(site.data),
      initialData: page === initialPage ? initialPosts : undefined,
    },
  );
  function move(next: number) {
    setPage(next);
    const query = new URLSearchParams();
    if (next > 1) query.set("page", String(next));
    if (category !== "all") query.set("category", category);
    window.history.replaceState(
      null,
      "",
      `/posts${query.size ? `?${query}` : ""}`,
    );
    window.dispatchEvent(new Event("travel-category-change"));
  }
  return (
    <main className="mx-auto w-full max-w-[var(--content-max)] px-5 py-10 md:px-8 md:py-14 xl:px-16">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-muted-foreground text-sm">OUR TRAVEL JOURNAL</p>
          <h1 className="mt-2 font-serif text-3xl sm:text-4xl">여행 기록</h1>
        </div>
        <label className="grid w-full gap-2 text-base sm:max-w-xs">
          <span>여행 분류</span>
          <Select
            value={category}
            onChange={(event) => {
              const next = event.target.value as CategoryCode | "all";
              setCategory(next);
              setPage(1);
              const query = new URLSearchParams();
              if (next !== "all") query.set("category", next);
              window.history.replaceState(
                null,
                "",
                `/posts${query.size ? `?${query}` : ""}`,
              );
              window.dispatchEvent(new Event("travel-category-change"));
            }}
          >
            <option value="all">모든 여행</option>
            {CATEGORIES.map((item) => (
              <option key={item.code} value={item.code}>
                {item.label}
              </option>
            ))}
          </Select>
        </label>
      </header>
      <div className="mt-8 space-y-6">
        {(site.error || posts.error) && (
          <ErrorState
            description={errorMessage(site.error ?? posts.error)}
            onRetry={() => {
              void site.refetch();
              void posts.refetch();
            }}
          />
        )}
        {(site.isPending || posts.isPending) && (
          <LoadingState label="여행 기록을 불러오고 있어요…" />
        )}
        {posts.data && posts.data.length > 0 && (
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {posts.data.map((post) => (
              <li key={post.post_id}>
                <Link
                  href={`/posts/${encodeURIComponent(post.slug)}`}
                  className="rounded-panel border-border bg-surface hover:border-primary hover:bg-muted/40 flex min-h-36 flex-col justify-between border p-5 focus-visible:relative"
                >
                  <span className="text-muted-foreground text-sm">
                    {CATEGORIES.find((item) => item.code === post.category_code)
                      ?.label ?? "여행 기록"}
                  </span>
                  <span className="mt-6 font-serif text-xl">{post.title}</span>
                  <span className="text-muted-foreground mt-3 text-sm">
                    {new Intl.DateTimeFormat("ko-KR", {
                      dateStyle: "long",
                    }).format(new Date(post.published_at))}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
        {posts.data?.length === 0 && (
          <EmptyState
            title="아직 여행 기록이 없어요"
            description="새로운 여행 이야기가 올라오면 이곳에서 읽을 수 있어요."
            action={
              <Button asChild variant="outline">
                <Link href="/">홈으로 돌아가기</Link>
              </Button>
            }
          />
        )}
        {posts.data && posts.data.length > 0 && (
          <Pagination
            page={page}
            hasNextPage={posts.data.length === 12}
            busy={posts.isFetching}
            onPageChange={move}
          />
        )}
      </div>
    </main>
  );
}
