import Link from "next/link";
import type { ActionOutput } from "@repo/contracts";
import { CATEGORIES } from "@repo/constants";
import { PdfCover, PrivateImage } from "./posts/post-media";

export type PublicPostCard = ActionOutput<"posts.list">[number];

export function PostCard({ post, siteId }: { post: PublicPostCard; siteId: string }) {
  const pdf = post.category_code === "itinerary-pdf";
  const metadata = post.metadata as Record<string, unknown>;
  const dateRange = (start: unknown, end?: unknown) => typeof start === "string" ? `${new Intl.DateTimeFormat("ko-KR", { dateStyle: "medium" }).format(new Date(`${start}T00:00:00Z`))}${typeof end === "string" ? ` – ${new Intl.DateTimeFormat("ko-KR", { dateStyle: "medium" }).format(new Date(`${end}T00:00:00Z`))}` : ""}` : "";
  const travelInfo = [
    typeof metadata.region === "string" ? metadata.region : "",
    typeof metadata.visited_on === "string" ? `방문 ${dateRange(metadata.visited_on)}` :
      typeof metadata.start_date === "string" ? `여행 ${dateRange(metadata.start_date, metadata.end_date)}` :
        typeof metadata.check_in === "string" ? `숙박 ${dateRange(metadata.check_in, metadata.check_out)}` : "",
    typeof metadata.venue_type === "string" ? metadata.venue_type === "cafe" ? "카페" : "음식점" : "",
  ].filter(Boolean).join(" · ");
  return (
    <li>
      <Link href={`/posts/${encodeURIComponent(post.slug)}`} className="group rounded-panel border-border bg-surface hover:border-primary flex h-full min-h-72 flex-col overflow-hidden border transition-colors focus-visible:relative">
        <div className="aspect-[3/2] w-full overflow-hidden bg-[linear-gradient(150deg,#d8e2d8,#b9d1cf_45%,#f4eee2)]">{pdf && post.pdf_asset_id ? <PdfCover assetId={post.pdf_asset_id} siteId={siteId} title={post.title} allowRetry={false} /> : post.cover_asset_id ? <PrivateImage assetId={post.cover_asset_id} siteId={siteId} title={`${post.title} 대표 사진`} className="h-full w-full max-h-none rounded-none object-cover" allowRetry={false} /> : null}</div>
        <span className="flex flex-1 flex-col items-start p-5">
          {!pdf && <span className="text-muted-foreground text-sm">{CATEGORIES.find((item) => item.code === post.category_code)?.label}</span>}
          <span className="mt-3 font-serif text-xl leading-relaxed group-hover:underline">{post.title}</span>
          {!pdf && travelInfo && <span className="text-muted-foreground mt-2 text-sm">{travelInfo}</span>}
          <time className="text-muted-foreground mt-auto pt-4 text-sm" dateTime={post.published_at}>{new Intl.DateTimeFormat("ko-KR", { dateStyle: "long" }).format(new Date(post.published_at))}</time>
          {!pdf && <span className="text-muted-foreground mt-2 text-sm">♡ {post.like_count ?? 0} · 댓글 {post.comment_count ?? 0}</span>}
        </span>
      </Link>
    </li>
  );
}
