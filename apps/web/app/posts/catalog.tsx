"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import type { ActionOutput } from "@repo/contracts";
import { createBrowserTravelApi } from "@repo/api-client/browser";
import { useTravelQuery } from "@repo/api-client/hooks";
import { errorMessage } from "@repo/api-client";
import { pageOffset } from "@repo/api-client/query";
export function Catalog({
  initialSite,
  initialPosts,
  initialPage = 1,
}: {
  initialSite?: ActionOutput<"site.get">;
  initialPosts?: ActionOutput<"posts.list">;
  initialPage?: number;
}) {
  const api = useMemo(() => createBrowserTravelApi(), []);
  const [page, setPage] = useState(initialPage);
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
    { site_id: siteId, limit: 12, offset: pageOffset(page) },
    { siteId, actor: "public" },
    {
      enabled: Boolean(site.data),
      initialData: page === initialPage ? initialPosts : undefined,
    },
  );
  function move(next: number) {
    setPage(next);
    window.history.replaceState(null, "", `/posts?page=${next}`);
  }
  return (
    <main className="mx-auto max-w-3xl space-y-4 p-8">
      <h1>여행 기록</h1>
      {(site.error || posts.error) && (
        <p role="alert">{errorMessage(site.error ?? posts.error)}</p>
      )}
      {(site.isPending || posts.isPending) && (
        <p role="status">기록을 불러오고 있어요…</p>
      )}
      <ul>
        {posts.data?.map((post) => (
          <li key={post.post_id}>
            <Link href={`/posts/${encodeURIComponent(post.slug)}`}>
              {post.title}
            </Link>
          </li>
        ))}
      </ul>
      {posts.data?.length === 0 && <p>여행 기록을 준비하고 있어요.</p>}
      <nav aria-label="페이지 이동">
        <button
          disabled={page <= 1 || posts.isFetching}
          onClick={() => move(page - 1)}
        >
          이전
        </button>
        <span> {page} 페이지 </span>
        <button
          disabled={posts.isFetching || posts.data?.length !== 12}
          onClick={() => move(page + 1)}
        >
          다음
        </button>
      </nav>
    </main>
  );
}
