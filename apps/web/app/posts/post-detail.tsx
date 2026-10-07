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
import { PostCardSkeleton } from "../post-card";
import { PostAssetFigures, PrivatePdf, PrivateImage } from "./post-media";
import { PostCover } from "./post-cover";
import { PublicApiErrorState } from "../public-feedback";
import { EmptyState } from "@repo/ui/feedback";
import { Skeleton } from "@repo/ui/skeleton";
import { Button } from "@repo/ui/button";
import { Dialog } from "@repo/ui/dialog";
import { CommentSection } from "./comment-section";
import styles from "./post-detail.module.css";

export function PostDetailSkeleton() {
  return (
    <main
      className={styles.page}
      role="status"
      aria-label="여행 기록을 불러오는 중"
    >
      <span className="sr-only">여행 기록을 불러오는 중입니다.</span>
      <div className={styles.skeletonPage} aria-hidden="true">
        <Skeleton className={styles.skeletonBack} />
        <div className={styles.skeletonHeader}>
          <Skeleton className={styles.skeletonEyebrow} />
          <Skeleton className={styles.skeletonTitle} />
          <Skeleton className={styles.skeletonTitleShort} />
          <Skeleton className={styles.skeletonSummary} />
          <div className={styles.skeletonMeta}>
            <Skeleton className={styles.skeletonMetaLine} />
            <Skeleton className={styles.skeletonMetaAction} />
          </div>
        </div>
        <Skeleton className={styles.skeletonCover} />
        <Skeleton className={styles.skeletonCaption} />
        <div className={styles.skeletonBody}>
          {[95, 91, 97, 81, 93, 62].map((width, index) => (
            <Skeleton key={index} style={{ width: `${width}%` }} />
          ))}
        </div>
        <div className={styles.skeletonRelated}>
          <Skeleton className={styles.skeletonRelatedTitle} />
          <ul className={styles.relatedGrid}>
            <PostCardSkeleton />
            <PostCardSkeleton />
          </ul>
        </div>
      </div>
    </main>
  );
}

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
  const [activeHeadingId, setActiveHeadingId] = useState("");
  const [optimisticLike, setOptimisticLike] = useState<{
    liked: boolean;
    count: number;
  } | null>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [shareUrl, setShareUrl] = useState("");
  const [copyMessage, setCopyMessage] = useState("");
  const shareLink = useRef<HTMLInputElement>(null);
  const articleHtml = useMemo(
    () => (post.data?.body_html ?? "").replace(/<(\/?)h1(?=[\s>])/gi, "<$1h2"),
    [post.data?.body_html],
  );
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
  const mobileToc = useRef<HTMLDetailsElement>(null);
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
    setActiveHeadingId(next[0]?.id ?? "");
    const firstHeading = headings[0];
    if (!firstHeading || headings.length < 3) return;

    let animationFrame = 0;
    const updateActiveHeading = () => {
      cancelAnimationFrame(animationFrame);
      animationFrame = requestAnimationFrame(() => {
        const threshold = 140;
        const current =
          [...headings]
            .reverse()
            .find(
              (heading) => heading.getBoundingClientRect().top <= threshold,
            ) ?? firstHeading;
        setActiveHeadingId(current.id);
      });
    };
    updateActiveHeading();
    window.addEventListener("scroll", updateActiveHeading, { passive: true });
    window.addEventListener("resize", updateActiveHeading);
    return () => {
      cancelAnimationFrame(animationFrame);
      window.removeEventListener("scroll", updateActiveHeading);
      window.removeEventListener("resize", updateActiveHeading);
    };
  }, [articleHtml, slug]);
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
      <main className={styles.readErrorPage}>
        <PublicApiErrorState
          size="tall"
          error={readError ?? initialError}
          title="여행 기록에 연결하지 못했어요"
          description={readError ? undefined : initialError}
          onRetry={retryPost}
          isRetrying={site.isFetching || post.isFetching}
        />
      </main>
    );
  }
  if (!post.data) return <PostDetailSkeleton />;
  const article = post.data.category_code !== "itinerary-pdf";
  const metadata = post.data.metadata as Record<string, unknown>;
  const categoryLabel =
    CATEGORIES.find((item) => item.code === post.data.category_code)?.label ??
    "여행 기록";
  const region =
    typeof metadata.region === "string" ? metadata.region.trim() : "";
  const summary =
    typeof metadata.description === "string" ? metadata.description.trim() : "";
  const coverCaption =
    typeof metadata.cover_caption === "string"
      ? metadata.cover_caption.trim()
      : "";
  const formatDay = (value: unknown) =>
    typeof value === "string"
      ? new Intl.DateTimeFormat("ko-KR", { dateStyle: "long" }).format(
          new Date(`${value}T00:00:00Z`),
        )
      : "";
  const visitInfo = article
    ? [
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
  const relatedPosts =
    related.data
      ?.filter((item) => item.post_id !== post.data.post_id)
      .slice(0, 4) ?? [];
  const hasToc = contents.length >= 3;
  const tocLinks = (closeOnSelect: boolean) =>
    contents.map((item) => (
      <li key={item.id}>
        <a
          href={`#${item.id}`}
          aria-current={activeHeadingId === item.id ? "location" : undefined}
          onClick={() => {
            setActiveHeadingId(item.id);
            if (closeOnSelect && mobileToc.current) {
              mobileToc.current.open = false;
            }
          }}
        >
          {item.title}
        </a>
      </li>
    ));
  return (
    <main className={styles.page}>
      <Link
        className={styles.back}
        href={`/posts?category=${post.data.category_code}`}
      >
        ← {categoryLabel} 목록
      </Link>
      {readError && (
        <div className={styles.status}>
          <PublicApiErrorState
            size="small"
            error={readError}
            title="여행 기록을 새로 확인하지 못했어요"
            onRetry={retryPost}
            isRetrying={site.isFetching || post.isFetching}
          />
        </div>
      )}
      <article className={styles.article}>
        <header className={styles.head}>
          <p className={styles.eyebrow}>
            <span>{categoryLabel}</span>
            {region && <span>{region}</span>}
          </p>
          <h1 className={styles.title}>{post.data.title}</h1>
          {summary && <p className={styles.summary}>{summary}</p>}
          <div className={styles.metaBar}>
            <p className={styles.meta}>
              <span>
                게시{" "}
                <time dateTime={post.data.published_at}>
                  {new Intl.DateTimeFormat("ko-KR", {
                    dateStyle: "long",
                  }).format(new Date(post.data.published_at))}
                </time>
              </span>
              {visitInfo && <span>{visitInfo}</span>}
            </p>
            <div className={styles.actions}>
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
                  className={styles.action}
                >
                  <span className={styles.heart} aria-hidden="true">
                    {(optimisticLike ?? likeState.data)?.liked ? "♥" : "♡"}
                  </span>
                  좋아요{" "}
                  {(optimisticLike ?? likeState.data)?.count ??
                    post.data.like_count ??
                    0}
                </button>
              )}
              <button
                type="button"
                onClick={() => void sharePost()}
                className={styles.action}
              >
                ↗ 공유하기
              </button>
            </div>
          </div>
          {article && (likeState.error || setLike.error) && (
            <div className={styles.status}>
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
            </div>
          )}
        </header>
        {post.data.cover_asset_id && (
          <PostCover
            key={post.data.cover_asset_id}
            assetId={post.data.cover_asset_id}
            siteId={siteId}
            title={post.data.title}
            caption={coverCaption}
          />
        )}
        {post.data.pdf_asset_id && (
          <div className={styles.reading}>
            <PrivatePdf
              assetId={post.data.pdf_asset_id}
              siteId={siteId}
              title={post.data.title}
            />
          </div>
        )}
        {articleHtml && (
          <section
            className={styles.reading}
            data-has-toc={hasToc}
            aria-label="여행 이야기"
          >
            {hasToc && (
              <details ref={mobileToc} className={styles.mobileToc}>
                <summary>이 글의 목차</summary>
                <nav aria-label="이 글의 목차">
                  <ol>{tocLinks(true)}</ol>
                </nav>
              </details>
            )}
            <div ref={articleBody} className={styles.body}>
              <PostAssetFigures html={articleHtml} siteId={siteId} />
            </div>
            {hasToc && (
              <nav aria-label="이 글의 목차" className={styles.desktopToc}>
                <h2>이 글의 목차</h2>
                <ol>{tocLinks(false)}</ol>
              </nav>
            )}
          </section>
        )}
        {article && post.data.tags.length > 0 && (
          <div className={styles.tags} aria-label="글 태그">
            {post.data.tags.map((tag) => (
              <span key={tag}>#{tag}</span>
            ))}
          </div>
        )}
      </article>
      {post.data.category_code !== "itinerary-pdf" && (
        <div className={styles.comments}>
          <CommentSection
            key={post.data.post_id}
            siteId={siteId}
            postId={post.data.post_id}
            slug={slug}
            commentsEnabled={post.data.comments_enabled}
            commentCount={post.data.comment_count}
          />
        </div>
      )}
      {post.data.category_code !== "itinerary-pdf" &&
        related.isPending &&
        !related.data && (
          <section
            className={styles.afterArticle}
            role="status"
            aria-label="관련 여행 기록을 불러오는 중"
          >
            <span className="sr-only">관련 여행 기록을 불러오는 중입니다.</span>
            <div aria-hidden="true">
              <p className={styles.sectionKicker}>KEEP READING</p>
              <h2 className={styles.relatedHeading}>다음 여행 읽기</h2>
              <ul className={styles.relatedGrid}>
                <PostCardSkeleton />
                <PostCardSkeleton />
              </ul>
            </div>
          </section>
        )}
      {post.data.category_code !== "itinerary-pdf" && related.error && (
        <div className={styles.afterArticle}>
          <PublicApiErrorState
            size="small"
            error={related.error}
            title="같은 분류의 여행을 확인하지 못했어요"
            onRetry={() => void related.refetch()}
            isRetrying={related.isFetching}
          />
        </div>
      )}
      {post.data.category_code !== "itinerary-pdf" &&
        relatedPosts.length > 0 && (
          <section
            aria-labelledby="related-heading"
            className={styles.afterArticle}
          >
            <p className={styles.sectionKicker}>KEEP READING</p>
            <h2 id="related-heading" className={styles.relatedHeading}>
              다음 여행 읽기
            </h2>
            {relatedPosts.length === 1 ? (
              <ul className={styles.relatedSingle}>
                {relatedPosts.map((item) => (
                  <li key={item.post_id}>
                    <Link
                      href={`/posts/${encodeURIComponent(item.slug)}`}
                      className={styles.relatedLink}
                      data-has-image={Boolean(item.cover_asset_id)}
                    >
                      {item.cover_asset_id && (
                        <div className={styles.relatedMedia}>
                          <PrivateImage
                            assetId={item.cover_asset_id}
                            siteId={siteId}
                            title={`${item.title} 대표 사진`}
                            className="h-full w-full object-cover"
                            allowRetry={false}
                          />
                        </div>
                      )}
                      <span className={styles.relatedCopy}>
                        <span className={styles.relatedCategory}>
                          {CATEGORIES.find(
                            (category) => category.code === item.category_code,
                          )?.label ?? "여행 기록"}
                        </span>
                        <strong className={styles.relatedTitle}>
                          {item.title}
                        </strong>
                        <time
                          dateTime={item.published_at}
                          className={styles.relatedDate}
                        >
                          {new Intl.DateTimeFormat("ko-KR", {
                            dateStyle: "long",
                          }).format(new Date(item.published_at))}
                        </time>
                      </span>
                      <span className={styles.relatedArrow} aria-hidden="true">
                        ↗
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <ul className={styles.relatedGrid}>
                {relatedPosts.map((item) => (
                  <PostCard key={item.post_id} post={item} siteId={siteId} />
                ))}
              </ul>
            )}
          </section>
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
