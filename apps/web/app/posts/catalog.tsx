"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { ActionOutput } from "@repo/contracts";
import { createBrowserTravelApi } from "@repo/api-client/browser";
import { useTravelQuery } from "@repo/api-client/hooks";
import { errorMessage } from "@repo/api-client";
import { pageOffset } from "@repo/api-client/query";
import { CATEGORIES, type CategoryCode } from "@repo/constants";
import { Button } from "@repo/ui/button";
import { Select } from "@repo/ui/select";
import { Input } from "@repo/ui/input";
import { Pagination } from "@repo/ui/pagination";
import { EmptyState, ErrorState } from "@repo/ui/feedback";
import { LoadingState } from "@repo/ui/skeleton";
import { PostCard } from "../post-card";
export function Catalog({
  initialSite,
  initialPosts,
  initialPage = 1,
  initialCategory,
  initialTag,
  initialError,
}: {
  initialSite?: ActionOutput<"site.get">;
  initialPosts?: ActionOutput<"posts.list">;
  initialPage?: number;
  initialCategory?: CategoryCode;
  initialTag?: string;
  initialError?: string;
}) {
  const api = useMemo(() => createBrowserTravelApi(), []);
  const [page, setPage] = useState(initialPage);
  const [category, setCategory] = useState<CategoryCode | "all">(
    initialCategory ?? "all",
  );
  const [tag, setTag] = useState(initialTag ?? "");
  const [tagInput, setTagInput] = useState(initialTag ?? "");
  useEffect(() => {
    const sync = () => {
      const params = new URLSearchParams(window.location.search);
      const nextPage = Math.max(1, Number.parseInt(params.get("page") ?? "1", 10) || 1);
      const nextCategory = params.get("category");
      const nextTag = params.get("tag") ?? "";
      setPage(nextPage);
      setCategory(CATEGORIES.some((item) => item.code === nextCategory) ? nextCategory as CategoryCode : "all");
      setTag(nextTag);
      setTagInput(nextTag);
    };
    window.addEventListener("popstate", sync);
    return () => window.removeEventListener("popstate", sync);
  }, []);
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
      limit: 13,
      offset: pageOffset(page),
      category: category === "all" ? undefined : category,
      tag: tag || undefined,
    },
    { siteId, actor: "public" },
    {
      enabled: Boolean(site.data),
      initialData: page === initialPage && category === (initialCategory ?? "all") && tag === (initialTag ?? "") ? initialPosts : undefined,
    },
  );
  function move(next: number) {
    setPage(next);
    const query = new URLSearchParams();
    if (next > 1) query.set("page", String(next));
    if (category !== "all") query.set("category", category);
    if (tag) query.set("tag", tag);
    window.history.pushState(
      null,
      "",
      `/posts${query.size ? `?${query}` : ""}`,
    );
    window.dispatchEvent(new Event("travel-category-change"));
  }
  function applyFilters(nextCategory = category, nextTag = tag) {
    setCategory(nextCategory);
    setTag(nextTag);
    setPage(1);
    const query = new URLSearchParams();
    if (nextCategory !== "all") query.set("category", nextCategory);
    if (nextTag) query.set("tag", nextTag);
    window.history.pushState(null, "", `/posts${query.size ? `?${query}` : ""}`);
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
              applyFilters(next, tag);
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
        <form className="grid w-full gap-2 sm:max-w-xs" onSubmit={(event) => { event.preventDefault(); applyFilters(category, tagInput.trim().slice(0, 30)); }}>
          <label htmlFor="post-tag-filter">태그로 찾기</label>
          <div className="flex gap-2"><Input id="post-tag-filter" value={tagInput} maxLength={30} onChange={(event) => setTagInput(event.currentTarget.value)} placeholder="예: 제주" />{tagInput && <Button type="button" variant="outline" aria-label="태그 검색 지우기" onClick={() => { setTagInput(""); applyFilters(category, ""); }}>지우기</Button>}<Button type="submit" variant="outline">적용</Button></div>
        </form>
      </header>
      <div className="mt-8 space-y-6">
        {initialError && !site.data && <ErrorState title="공개 기록에 연결하지 못했어요" description={initialError} onRetry={() => { void site.refetch(); }} />}
        {(site.error || posts.error) && (
          <ErrorState
            description={errorMessage(site.error ?? posts.error)}
            onRetry={() => {
              void site.refetch();
              void posts.refetch();
            }}
          />
        )}
        {!site.error && !posts.error && (site.isPending || posts.isPending) && (
          <LoadingState label="여행 기록을 불러오고 있어요…" />
        )}
        {posts.data && posts.data.length > 0 && (
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {posts.data.slice(0, 12).map((post) => <PostCard key={post.post_id} post={post} siteId={siteId} />)}
          </ul>
        )}
        {posts.data?.length === 0 && (
          <EmptyState
            title={category !== "all" || tag ? "조건에 맞는 글이 없어요" : "아직 여행 기록이 없어요"}
            description={category !== "all" || tag ? "분류나 태그를 바꾸거나 필터를 지워 다시 찾아보세요." : "새로운 여행 이야기가 올라오면 이곳에서 읽을 수 있어요."}
            action={
              category !== "all" || tag ? <Button variant="outline" onClick={() => { setTagInput(""); applyFilters("all", ""); }}>필터 지우기</Button> : <Button asChild variant="outline"><Link href="/">홈으로 돌아가기</Link></Button>
            }
          />
        )}
        {posts.data && posts.data.length > 0 && (
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
