"use client";
import { useMemo, useRef, useState } from "react";
import { createBrowserTravelApi } from "@repo/api-client/browser";
import { useTravelQuery, useTravelMutation } from "@repo/api-client/hooks";
import { errorMessage, TravelApiError } from "@repo/api-client";
import type { ActionOutput } from "@repo/contracts";
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
    <main className="mx-auto max-w-3xl space-y-4 p-8">
      <h1>{post.data.title}</h1>
      <p>{post.data.tags.join(" · ")}</p>
      {post.data.body_html && (
        <div dangerouslySetInnerHTML={{ __html: post.data.body_html }} />
      )}
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
