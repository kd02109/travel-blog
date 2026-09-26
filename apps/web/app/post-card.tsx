import Link from "next/link";
import type { ActionOutput } from "@repo/contracts";
import { CATEGORIES } from "@repo/constants";
import { PrivateImage } from "./posts/post-media";

export type PublicPostCard = ActionOutput<"posts.list">[number];

export function PostCard({ post, siteId }: { post: PublicPostCard; siteId: string }) {
  const pdf = post.category_code === "itinerary-pdf";
  const metadata = post.metadata as Record<string, unknown>;
  const travelInfo = [
    typeof metadata.region === "string" ? metadata.region : "",
    typeof metadata.visited_on === "string" ? metadata.visited_on :
      typeof metadata.start_date === "string" ? `${metadata.start_date}${typeof metadata.end_date === "string" ? `–${metadata.end_date}` : ""}` :
        typeof metadata.check_in === "string" ? `${metadata.check_in}${typeof metadata.check_out === "string" ? `–${metadata.check_out}` : ""}` : "",
  ].filter(Boolean).join(" · ");
  return (
    <li>
      <Link href={`/posts/${encodeURIComponent(post.slug)}`} className="group rounded-panel border-border bg-surface hover:border-primary flex h-full min-h-72 flex-col overflow-hidden border transition-colors focus-visible:relative">
        {post.cover_asset_id ? <PrivateImage assetId={post.cover_asset_id} siteId={siteId} title={`${post.title} 대표 사진`} /> : <div aria-hidden="true" className="aspect-[3/2] bg-[linear-gradient(150deg,#d8e2d8,#b9d1cf_45%,#f4eee2)]" />}
        <span className="flex flex-1 flex-col items-start p-5">
          <span className="text-muted-foreground text-sm">{CATEGORIES.find((item) => item.code === post.category_code)?.label}</span>
          <span className="mt-3 font-serif text-xl leading-relaxed group-hover:underline">{post.title}</span>
          {!pdf && travelInfo && <span className="text-muted-foreground mt-2 text-sm">{travelInfo}</span>}
          <time className="text-muted-foreground mt-auto pt-4 text-sm" dateTime={post.published_at}>{new Intl.DateTimeFormat("ko-KR", { dateStyle: "long" }).format(new Date(post.published_at))}</time>
        </span>
      </Link>
    </li>
  );
}
