"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { createBrowserTravelApi } from "@repo/api-client/browser";
import { useTravelQuery, useTravelMutation } from "@repo/api-client/hooks";
import { errorMessage, TravelApiError } from "@repo/api-client";
import type { ActionOutput } from "@repo/contracts";
import { CATEGORIES, type CategoryCode } from "@repo/constants";
import { PostCard } from "../post-card";
import { PostAssetFigures, PrivatePdf, PrivateImage } from "./post-media";
export function PostDetail({
  slug,
  initialSite,
  initialPost,
}: {
  slug: string;
  initialSite?: ActionOutput<"site.get">;
  initialPost?: ActionOutput<"post.get">;
}) {
  const api = useMemo(() => createBrowserTravelApi(), []);
  const site = useTravelQuery(
    api,
    "site.get",
    { slug: "parents-travel" },
    { siteId: "lookup", actor: "public" },
    { initialData: initialSite },
  );
  const siteId = site.data?.id ?? "00000000-0000-0000-0000-000000000000";
  const scope = { siteId, actor: "public" };
  const post = useTravelQuery(
    api,
    "post.get",
    { site_id: siteId, slug },
    scope,
    { initialData: initialPost, enabled: Boolean(site.data) },
  );
  const comments = useTravelQuery(
    api,
    "comments.list",
    { id: post.data?.post_id ?? siteId, limit: 20 },
    scope,
    { enabled: Boolean(post.data?.comments_enabled) },
  );
  const mutation = useTravelMutation(api, "comment.create", scope);
  const [body, setBody] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const request = useRef({ fingerprint: "", key: "" });
  const [notice, setNotice] = useState("");
  const [contents, setContents] = useState<Array<{ id: string; title: string }>>([]);
  const articleBody = useRef<HTMLDivElement>(null);
  const related = useTravelQuery(api, "posts.list", {
    site_id: siteId,
    category: post.data?.category_code as CategoryCode | undefined,
    limit: 6,
    offset: 0,
  }, scope, { enabled: Boolean(post.data && post.data.category_code !== "itinerary-pdf") });

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
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!post.data) return;
    const fingerprint = JSON.stringify([body, name, password]);
    if (request.current.fingerprint !== fingerprint)
      request.current = { fingerprint, key: crypto.randomUUID() };
    try {
      await mutation.submit({
        id: post.data.post_id,
        body,
        guest_name: name,
        password,
        request_key: request.current.key,
      });
      setBody("");
      setPassword("");
      request.current = { fingerprint: "", key: "" };
      setNotice("댓글을 등록했습니다.");
    } catch {
      setNotice("");
    }
  }
  if (site.error || post.error)
    return (
      <main>
        <p role="alert">{errorMessage(site.error ?? post.error)}</p>
      </main>
    );
  if (!post.data)
    return (
      <main>
        <p role="status">기록을 불러오고 있어요…</p>
      </main>
    );
  return (
    <main className="mx-auto w-full max-w-[var(--article-max)] space-y-7 px-5 py-10 md:px-8 md:py-16">
      <Link className="inline-flex min-h-12 items-center underline underline-offset-4" href={`/posts?category=${post.data.category_code}`}>← {CATEGORIES.find((item) => item.code === post.data?.category_code)?.label ?? "여행 기록"} 목록</Link>
      <header className="space-y-4"><p className="text-muted-foreground">{CATEGORIES.find((item) => item.code === post.data?.category_code)?.label} · {new Intl.DateTimeFormat("ko-KR", { dateStyle: "long" }).format(new Date(post.data.published_at))}</p><h1 className="font-serif text-3xl leading-relaxed sm:text-4xl">{post.data.title}</h1>
        {post.data.category_code !== "itinerary-pdf" && <><p className="text-muted-foreground">{Object.entries(post.data.metadata).filter(([key, value]) => ["region", "visited_on", "start_date", "end_date", "check_in", "check_out", "place_name", "venue_type"].includes(key) && typeof value === "string").map(([key, value]) => `${key === "region" ? "지역" : key === "place_name" ? "장소" : key === "venue_type" ? value === "cafe" ? "카페" : "음식점" : ""} ${value}`).join(" · ")}</p><p className="flex flex-wrap gap-3">{post.data.tags.map((tag) => <Link key={tag} href={`/posts?tag=${encodeURIComponent(tag)}`} className="text-sm underline underline-offset-4">#{tag}</Link>)}</p></>}
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
          {contents.length > 0 && <nav aria-label="이 글의 목차" className="rounded-panel border bg-surface p-5"><h2 className="font-serif text-xl">이 글의 목차</h2><ol className="mt-3 list-decimal space-y-2 pl-5">{contents.map((item) => <li key={item.id}><a className="underline underline-offset-4" href={`#${item.id}`}>{item.title}</a></li>)}</ol></nav>}
          <div ref={articleBody} className="space-y-6 text-lg leading-[1.9] [&_a]:underline [&_figure]:my-8 [&_h2]:font-serif [&_h2]:text-2xl [&_h2]:leading-relaxed [&_h3]:font-serif [&_h3]:text-xl [&_p]:my-5"><PostAssetFigures html={post.data.body_html} siteId={siteId} /></div>
        </section>
      )}
      {post.data.category_code !== "itinerary-pdf" && related.data && related.data.filter((item) => item.post_id !== post.data?.post_id).length > 0 && <section aria-labelledby="related-heading"><h2 id="related-heading" className="font-serif text-2xl">같은 분류의 여행</h2><ul className="mt-4 grid gap-4 sm:grid-cols-2">{related.data.filter((item) => item.post_id !== post.data?.post_id).slice(0, 4).map((item) => <PostCard key={item.post_id} post={item} siteId={siteId} />)}</ul></section>}
      {post.data.comments_enabled && (
        <section aria-label="댓글">
          <h2>댓글</h2>
          {comments.error && <p role="alert">{errorMessage(comments.error)}</p>}
          <ul>
            {comments.data?.map((c) => (
              <li key={c.id}>
                {c.display_name}: {c.body}
              </li>
            ))}
          </ul>
          <form onSubmit={submit} className="space-y-2">
            <fieldset disabled={mutation.isPending}>
              <label>
                이름
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  minLength={2}
                  maxLength={30}
                  required
                />
              </label>
              <label>
                댓글
                <textarea
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  maxLength={1000}
                  required
                />
              </label>
              <label>
                댓글 비밀번호
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  minLength={8}
                  maxLength={128}
                  required
                  autoComplete="new-password"
                />
              </label>
              <button type="submit">
                {mutation.isPending ? "등록 중…" : "댓글 등록"}
              </button>
            </fieldset>
          </form>
          {mutation.error && <p role="alert">{errorMessage(mutation.error)}</p>}
          {mutation.error instanceof TravelApiError &&
            mutation.error.status === 409 && (
              <button
                onClick={() => {
                  void post.refetch();
                  void comments.refetch();
                }}
              >
                최신 내용 확인
              </button>
            )}
          {notice && <p role="status">{notice}</p>}
        </section>
      )}
    </main>
  );
}
