"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { createBrowserTravelApi } from "@repo/api-client/browser";
import { ApiErrorState, ApiMutationError } from "@repo/api-client/feedback";
import { useTravelMutation, useTravelQuery } from "@repo/api-client/hooks";
import { TravelApiError } from "@repo/api-client";
import type { ActionOutput } from "@repo/contracts";
import { CATEGORIES, type CategoryCode } from "@repo/constants";
import { PostCard } from "../post-card";
import { PostAssetFigures, PrivatePdf, PrivateImage } from "./post-media";
import { EmptyState } from "@repo/ui/feedback";
import { LoadingState } from "@repo/ui/skeleton";
import { Button } from "@repo/ui/button";
import { Dialog } from "@repo/ui/dialog";
import { CommentSection } from "./comment-section";
export function PostDetail({
  slug,
  initialSite,
  initialPost,
  initialError,
}: {
  slug: string;
  initialSite?: ActionOutput<"site.get">;
  initialPost?: ActionOutput<"post.get">;
  initialError?: string;
}) {
  const api = useMemo(() => createBrowserTravelApi(), []);
  const site = useTravelQuery(
    api,
    "site.get",
    { slug: "parents-travel" },
    { siteId: "lookup", actor: "public" },
    { initialData: initialSite, staleTime: 0 },
  );
  const siteId = site.data?.id ?? "00000000-0000-0000-0000-000000000000";
  const scope = { siteId, actor: "public" };
  const post = useTravelQuery(
    api,
    "post.get",
    { site_id: siteId, slug },
    scope,
    { initialData: initialPost, enabled: Boolean(site.data), staleTime: 0 },
  );
  const [contents, setContents] = useState<
    Array<{ id: string; title: string }>
  >([]);
  const [optimisticLike, setOptimisticLike] = useState<{
    liked: boolean;
    count: number;
  } | null>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [shareUrl, setShareUrl] = useState("");
  const [copyMessage, setCopyMessage] = useState("");
  const shareLink = useRef<HTMLInputElement>(null);
  const likeState = useTravelQuery(
    api,
    "like.get",
    { id: post.data?.post_id ?? siteId },
    scope,
    {
      enabled: Boolean(
        post.data && post.data.category_code !== "itinerary-pdf",
      ),
      staleTime: 0,
    },
  );
  const setLike = useTravelMutation(api, "like.set", scope);
  const articleBody = useRef<HTMLDivElement>(null);
  const related = useTravelQuery(
    api,
    "posts.list",
    {
      site_id: siteId,
      category: post.data?.category_code as CategoryCode | undefined,
      limit: 6,
      offset: 0,
    },
    scope,
    {
      enabled: Boolean(
        post.data && post.data.category_code !== "itinerary-pdf",
      ),
      staleTime: 0,
    },
  );
  const readError = site.error ?? post.error;
  const retryPost = () => {
    if (!site.data || site.error) void site.refetch();
    if (site.data && (post.error || !post.data)) void post.refetch();
  };

  useEffect(() => {
    const root = articleBody.current;
    if (!root) return;
    const headings = [...root.querySelectorAll<HTMLElement>("h1, h2, h3")];
    const next = headings.map((heading, index) => {
      const id = `${slug}-section-${index + 1}`;
      heading.id = id;
      return { id, title: heading.textContent?.trim() || `본문 ${index + 1}` };
    });
    setContents(next);
  }, [post.data?.body_html, slug]);
  async function toggleLike() {
    const current = optimisticLike ?? likeState.data;
    if (!current || setLike.isPending || !post.data) return;
    const next = {
      liked: !current.liked,
      count: Math.max(0, current.count + (current.liked ? -1 : 1)),
    };
    setOptimisticLike(next);
    setLike.reset();
    try {
      const result = await setLike.submit({
        id: post.data.post_id,
        liked: next.liked,
      });
      setOptimisticLike(result);
    } catch {
      setOptimisticLike(null);
    }
  }
  async function sharePost() {
    if (!post.data) return;
    const url = new URL(
      `/posts/${encodeURIComponent(slug)}`,
      window.location.origin,
    ).href;
    const data: ShareData = { title: post.data.title, url };
    if (
      typeof navigator.share === "function" &&
      (typeof navigator.canShare !== "function" || navigator.canShare(data))
    ) {
      try {
        await navigator.share(data);
        return;
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") return;
      }
    }
    setShareUrl(url);
    setCopyMessage("");
    setShareOpen(true);
  }
  async function copyShareLink() {
    const url = shareLink.current?.value;
    if (!url) return;
    try {
      if (!navigator.clipboard?.writeText)
        throw new Error("Clipboard unavailable");
      await navigator.clipboard.writeText(url);
      setCopyMessage("링크를 복사했어요.");
    } catch {
      shareLink.current?.select();
      setCopyMessage("주소를 선택해 복사해 주세요.");
    }
  }
  if (
    (post.error instanceof TravelApiError && post.error.status === 404) ||
    (site.error instanceof TravelApiError && site.error.status === 404)
  )
    return (
      <main className="mx-auto w-full max-w-3xl px-5 py-12">
        <EmptyState
          title="이 여행 기록을 찾을 수 없어요"
          description="주소가 바뀌었거나 공개되지 않은 글입니다."
          action={
            <Button asChild variant="outline">
              <Link href="/posts">공개 글 목록으로</Link>
            </Button>
          }
        />
      </main>
    );
  if (!post.data && (readError || initialError)) {
    return (
      <main className="mx-auto w-full max-w-3xl px-5 py-12">
        <ApiErrorState
          error={readError ?? initialError}
          title="여행 기록에 연결하지 못했어요"
          description={readError ? undefined : initialError}
          onRetry={retryPost}
          isRetrying={site.isFetching || post.isFetching}
        />
      </main>
    );
  }
  if (!post.data)
    return (
      <main className="mx-auto w-full max-w-3xl px-5 py-12">
        <LoadingState label="여행 기록을 불러오고 있어요…" />
      </main>
    );
  const article = post.data.category_code !== "itinerary-pdf";
  const metadata = post.data.metadata as Record<string, unknown>;
  const formatDay = (value: unknown) =>
    typeof value === "string"
      ? new Intl.DateTimeFormat("ko-KR", { dateStyle: "long" }).format(
          new Date(`${value}T00:00:00Z`),
        )
      : "";
  const visitInfo = article
    ? [
        typeof metadata.region === "string" ? `지역 ${metadata.region}` : "",
        post.data.category_code === "day-walk"
          ? `다녀온 날 ${formatDay(metadata.visited_on)}`
          : "",
        post.data.category_code === "overnight-trip"
          ? `여행 기간 ${formatDay(metadata.start_date)}${metadata.end_date ? ` – ${formatDay(metadata.end_date)}` : ""}`
          : "",
        post.data.category_code === "food-cafe"
          ? `${metadata.venue_type === "cafe" ? "카페" : "음식점"}${typeof metadata.place_name === "string" ? ` · ${metadata.place_name}` : ""} · 방문일 ${formatDay(metadata.visited_on)}`
          : "",
        post.data.category_code === "stay-review"
          ? `${typeof metadata.place_name === "string" ? metadata.place_name : "숙소"} · ${formatDay(metadata.check_in)} – ${formatDay(metadata.check_out)}`
          : "",
      ]
        .filter(Boolean)
        .join(" · ")
    : "";
  return (
    <main className="mx-auto w-full max-w-[var(--article-max)] space-y-7 px-5 py-10 md:px-8 md:py-16">
      <Link
        className="inline-flex min-h-12 items-center underline underline-offset-4"
        href={`/posts?category=${post.data.category_code}`}
      >
        ←{" "}
        {CATEGORIES.find((item) => item.code === post.data?.category_code)
          ?.label ?? "여행 기록"}{" "}
        목록
      </Link>
      {readError && (
        <ApiErrorState
          error={readError}
          title="여행 기록을 새로 확인하지 못했어요"
          onRetry={retryPost}
          isRetrying={site.isFetching || post.isFetching}
        />
      )}
      <header className="space-y-4">
        <p className="text-muted-foreground">
          {
            CATEGORIES.find((item) => item.code === post.data?.category_code)
              ?.label
          }{" "}
          · 게시일{" "}
          {new Intl.DateTimeFormat("ko-KR", { dateStyle: "long" }).format(
            new Date(post.data.published_at),
          )}
        </p>
        <h1 className="font-serif text-3xl leading-relaxed sm:text-4xl">
          {post.data.title}
        </h1>
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-3">
            {article && (
              <button
                type="button"
                onClick={() => void toggleLike()}
                disabled={
                  setLike.isPending ||
                  likeState.isLoading ||
                  (!likeState.data && !optimisticLike)
                }
                aria-label={
                  (optimisticLike ?? likeState.data)?.liked
                    ? "좋아요 취소"
                    : "좋아요"
                }
                aria-pressed={
                  (optimisticLike ?? likeState.data)?.liked ?? false
                }
                className="rounded-control inline-flex min-h-11 min-w-11 items-center gap-2 px-2 text-base transition-transform hover:opacity-75 active:scale-95 disabled:opacity-60"
              >
                {(optimisticLike ?? likeState.data)?.liked ? (
                  <span aria-hidden="true">♥</span>
                ) : (
                  <span aria-hidden="true">♡</span>
                )}
                좋아요 ·{" "}
                {(optimisticLike ?? likeState.data)?.count ??
                  post.data.like_count ??
                  0}
              </button>
            )}
            <button
              type="button"
              onClick={() => void sharePost()}
              className="rounded-control inline-flex min-h-11 items-center px-2 text-base transition-opacity hover:opacity-75"
            >
              공유하기 ↗
            </button>
          </div>
          {article && (
            <>
              {likeState.error && (
                <ApiErrorState
                  error={likeState.error}
                  title="좋아요 상태를 확인하지 못했어요"
                  onRetry={() => void likeState.refetch()}
                  isRetrying={likeState.isFetching}
                />
              )}
              {setLike.error && (
                <ApiMutationError
                  error={setLike.error}
                  title="좋아요를 저장하지 못했어요"
                  onRetry={() => void toggleLike()}
                  isRetrying={setLike.isPending}
                />
              )}
            </>
          )}
        </div>
        {article && (
          <>
            <p className="text-muted-foreground">{visitInfo}</p>
            <p className="flex flex-wrap gap-3">
              {post.data.tags.map((tag) => (
                <span key={tag} className="text-muted-foreground text-sm">
                  #{tag}
                </span>
              ))}
            </p>
          </>
        )}
      </header>
      {post.data.cover_asset_id && (
        <PrivateImage
          assetId={post.data.cover_asset_id}
          siteId={siteId}
          title={`${post.data.title} 대표 사진`}
        />
      )}
      {post.data.pdf_asset_id && (
        <PrivatePdf
          assetId={post.data.pdf_asset_id}
          siteId={siteId}
          title={post.data.title}
        />
      )}
      {post.data.body_html && (
        <section className="space-y-6">
          {contents.length > 0 && (
            <nav
              aria-label="이 글의 목차"
              className="rounded-panel bg-surface border p-5"
            >
              <h2 className="font-serif text-xl">이 글의 목차</h2>
              <ol className="mt-3 list-decimal space-y-2 pl-5">
                {contents.map((item) => (
                  <li key={item.id}>
                    <a
                      className="underline underline-offset-4"
                      href={`#${item.id}`}
                    >
                      {item.title}
                    </a>
                  </li>
                ))}
              </ol>
            </nav>
          )}
          <div
            ref={articleBody}
            className="space-y-6 text-lg leading-[1.9] [&_a]:underline [&_figure]:my-8 [&_h2]:font-serif [&_h2]:text-2xl [&_h2]:leading-relaxed [&_h3]:font-serif [&_h3]:text-xl [&_p]:my-5"
          >
            <PostAssetFigures html={post.data.body_html} siteId={siteId} />
          </div>
        </section>
      )}
      {post.data.category_code !== "itinerary-pdf" && related.error && (
        <ApiErrorState
          error={related.error}
          title="같은 분류의 여행을 확인하지 못했어요"
          onRetry={() => void related.refetch()}
          isRetrying={related.isFetching}
        />
      )}
      {post.data.category_code !== "itinerary-pdf" &&
        related.data &&
        related.data.filter((item) => item.post_id !== post.data?.post_id)
          .length > 0 && (
          <section aria-labelledby="related-heading">
            <h2 id="related-heading" className="font-serif text-2xl">
              같은 분류의 여행
            </h2>
            <ul className="mt-4 grid gap-4 sm:grid-cols-2">
              {related.data
                .filter((item) => item.post_id !== post.data?.post_id)
                .slice(0, 4)
                .map((item) => (
                  <PostCard key={item.post_id} post={item} siteId={siteId} />
                ))}
            </ul>
          </section>
        )}
      {post.data.category_code !== "itinerary-pdf" && (
        <CommentSection
          siteId={siteId}
          postId={post.data.post_id}
          slug={slug}
          commentsEnabled={post.data.comments_enabled}
        />
      )}
      <Dialog
        open={shareOpen}
        onOpenChange={setShareOpen}
        title="여행 기록 공유하기"
        description="아래 주소를 복사해 이 글을 전할 수 있어요."
      >
        <div className="space-y-3">
          <label htmlFor="post-share-url" className="block text-sm font-medium">
            글 주소
          </label>
          <input
            ref={shareLink}
            id="post-share-url"
            type="url"
            readOnly
            value={shareUrl}
            onFocus={(event) => event.currentTarget.select()}
            className="border-input bg-surface text-foreground rounded-control min-h-12 w-full border px-3 text-sm"
          />
          <Button type="button" onClick={() => void copyShareLink()}>
            링크 복사
          </Button>
          {copyMessage && (
            <p role="status" className="text-muted-foreground text-sm">
              {copyMessage}
            </p>
          )}
        </div>
      </Dialog>
    </main>
  );
}
