import Link from "next/link";
import type { ActionOutput } from "@repo/contracts";
import { CATEGORIES } from "@repo/constants";
import { Skeleton } from "@repo/ui/skeleton";
import { PdfCover, PrivateImage } from "./posts/post-media";

export type PublicPostCard = ActionOutput<"posts.list">[number];

/** The same media and copy proportions as a public post card. */
export function PostCardSkeleton({ featured = false }: { featured?: boolean }) {
  return (
    <li aria-hidden="true" className="min-w-0">
      <div className="rounded-panel border-border bg-surface flex h-full min-h-72 flex-col overflow-hidden border">
        <Skeleton className="aspect-[3/2] w-full rounded-none" />
        <div className="flex flex-1 flex-col p-5">
          <Skeleton className="h-3 w-1/3" />
          <Skeleton className="mt-4 h-6 w-4/5" />
          <Skeleton className="mt-2 h-6 w-2/3" />
          <Skeleton className="mt-4 h-3 w-3/5" />
          <Skeleton className="mt-auto h-3 w-2/5" />
          <Skeleton className="mt-2 h-3 w-1/3" />
          {featured && <Skeleton className="mt-7 h-3 w-1/4" />}
        </div>
      </div>
    </li>
  );
}

export function PostCard({
  post,
  siteId,
  featured = false,
}: {
  post: PublicPostCard;
  siteId: string;
  featured?: boolean;
}) {
  const pdf = post.category_code === "itinerary-pdf";
  const hasImage = Boolean((pdf && post.pdf_asset_id) || post.cover_asset_id);
  const metadata = post.metadata as Record<string, unknown>;
  const dateRange = (start: unknown, end?: unknown) =>
    typeof start === "string"
      ? `${new Intl.DateTimeFormat("ko-KR", { dateStyle: "medium" }).format(new Date(`${start}T00:00:00Z`))}${typeof end === "string" ? ` – ${new Intl.DateTimeFormat("ko-KR", { dateStyle: "medium" }).format(new Date(`${end}T00:00:00Z`))}` : ""}`
      : "";
  const travelInfo = [
    typeof metadata.region === "string" ? metadata.region : "",
    typeof metadata.visited_on === "string"
      ? `방문 ${dateRange(metadata.visited_on)}`
      : typeof metadata.start_date === "string"
        ? `여행 ${dateRange(metadata.start_date, metadata.end_date)}`
        : typeof metadata.check_in === "string"
          ? `숙박 ${dateRange(metadata.check_in, metadata.check_out)}`
          : "",
    typeof metadata.venue_type === "string"
      ? metadata.venue_type === "cafe"
        ? "카페"
        : "음식점"
      : "",
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <li>
      <Link
        href={`/posts/${encodeURIComponent(post.slug)}`}
        data-has-image={hasImage}
        data-featured={featured}
        className={`group rounded-panel border-border hover:border-primary flex h-full min-h-72 flex-col overflow-hidden border transition-colors focus-visible:relative ${hasImage ? "bg-surface" : "bg-[var(--muted)]"}`}
      >
        {hasImage && (
          <div
            data-card-media
            className="aspect-[3/2] w-full overflow-hidden bg-[linear-gradient(150deg,#d8e2d8,#b9d1cf_45%,#f4eee2)]"
          >
            {pdf && post.pdf_asset_id ? (
              <PdfCover
                assetId={post.pdf_asset_id}
                siteId={siteId}
                title={post.title}
                allowRetry={false}
              />
            ) : post.cover_asset_id ? (
              <PrivateImage
                assetId={post.cover_asset_id}
                siteId={siteId}
                title={`${post.title} 대표 사진`}
                className="h-full max-h-none w-full rounded-none object-cover"
                allowRetry={false}
              />
            ) : null}
          </div>
        )}
        <span
          data-card-copy
          className={`flex flex-1 flex-col items-start ${hasImage ? "p-5" : "p-7"}`}
        >
          {!pdf && (
            <span className="text-muted-foreground text-sm">
              {
                CATEGORIES.find((item) => item.code === post.category_code)
                  ?.label
              }
            </span>
          )}
          <span
            data-card-title
            className={`font-serif leading-relaxed group-hover:underline ${hasImage ? "mt-3 text-xl" : "mt-8 text-2xl"}`}
          >
            {post.title}
          </span>
          {!pdf && travelInfo && (
            <span className="text-muted-foreground mt-2 text-sm">
              {travelInfo}
            </span>
          )}
          <time
            className={`text-muted-foreground pt-4 text-sm ${featured ? "mt-3" : "mt-auto"}`}
            dateTime={post.published_at}
          >
            {new Intl.DateTimeFormat("ko-KR", { dateStyle: "long" }).format(
              new Date(post.published_at),
            )}
          </time>
          {!pdf && (
            <span className="text-muted-foreground mt-2 text-sm">
              ♡ {post.like_count ?? 0} · 댓글 {post.comment_count ?? 0}
            </span>
          )}
          {featured && (
            <span
              data-card-cta
              className="mt-auto pt-7 text-sm font-semibold underline underline-offset-4"
            >
              {pdf ? "일정표 보기" : "자세히 읽기"}{" "}
              <span aria-hidden="true">↗</span>
            </span>
          )}
          {!hasImage && !featured && (
            <span aria-hidden="true" className="mt-6 self-end text-xl">
              ↗
            </span>
          )}
        </span>
      </Link>
    </li>
  );
}
