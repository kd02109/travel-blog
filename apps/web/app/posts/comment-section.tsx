"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { createBrowserDatabase } from "@repo/database/browser";
import { createBrowserTravelApi } from "@repo/api-client/browser";
import { useTravelMutation, useTravelQuery } from "@repo/api-client/hooks";
import { errorMessage, TravelApiError } from "@repo/api-client";
import type { ActionOutput } from "@repo/contracts";
import { Button } from "@repo/ui/button";

type Comment = ActionOutput<"comments.list">[number];

export function CommentSection({
  siteId,
  postId,
  slug,
  commentsEnabled,
}: {
  siteId: string;
  postId: string;
  slug: string;
  commentsEnabled: boolean;
}) {
  const api = useMemo(() => createBrowserTravelApi(), []);
  const scope = { siteId, actor: "public" };
  const [signedIn, setSignedIn] = useState(false);
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [reporting, setReporting] = useState<string | null>(null);
  const composer = useRef<HTMLFormElement>(null);
  const [reportReason, setReportReason] = useState<
    "spam" | "abuse" | "personal_information" | "other"
  >("spam");
  const comments = useTravelQuery(
    api,
    "comments.list",
    { id: postId, limit: 50, offset: 0 },
    scope,
    { staleTime: 0 },
  );
  const me = useTravelQuery(
    api,
    "me",
    {},
    { siteId, actor: "reader" },
    { enabled: signedIn, staleTime: 0 },
  );
  const create = useTravelMutation(api, "comment.create", scope);
  const edit = useTravelMutation(api, "comment.edit", scope);
  const remove = useTravelMutation(api, "comment.delete", scope);
  const report = useTravelMutation(api, "comment.report", scope);
  const saveProfile = useTravelMutation(api, "profile.save", {
    siteId,
    actor: "reader",
  });

  useEffect(() => {
    const auth = createBrowserDatabase().auth;
    void auth
      .getSession()
      .then(({ data }) => setSignedIn(Boolean(data.session)));
    const { data: listener } = auth.onAuthStateChange((_event, session) =>
      setSignedIn(Boolean(session)),
    );
    return () => listener.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(`travel-comment-draft:${postId}`);
      if (!raw || !composer.current) return;
      const draft = JSON.parse(raw) as { name?: unknown; body?: unknown };
      const nameInput = composer.current.elements.namedItem("name");
      const bodyInput = composer.current.elements.namedItem("body");
      if (
        nameInput instanceof HTMLInputElement &&
        typeof draft.name === "string"
      )
        nameInput.value = draft.name;
      if (
        bodyInput instanceof HTMLTextAreaElement &&
        typeof draft.body === "string"
      )
        bodyInput.value = draft.body;
    } catch {
      sessionStorage.removeItem(`travel-comment-draft:${postId}`);
    }
  }, [postId]);

  function saveDraftBeforeLogin() {
    if (!composer.current) return;
    const data = new FormData(composer.current);
    try {
      sessionStorage.setItem(
        `travel-comment-draft:${postId}`,
        JSON.stringify({ name: data.get("name"), body: data.get("body") }),
      );
      setNotice(
        "댓글을 이 탭에 보관했습니다. 카카오 로그인 후 돌아오면 비밀번호를 다시 입력해 주세요.",
      );
    } catch {
      setNotice(
        "브라우저에서 임시 보관할 수 없습니다. 댓글을 복사한 뒤 로그인해 주세요.",
      );
    }
  }

  async function submit(
    event: React.FormEvent<HTMLFormElement>,
    parentId: string | null = null,
  ) {
    event.preventDefault();
    const target = event.currentTarget;
    const form = new FormData(target);
    const text = String(form.get("body") ?? "").trim();
    const displayName = signedIn
      ? me.data?.profile?.display_name || String(form.get("name") ?? "").trim()
      : String(form.get("name") ?? "").trim();
    if (
      !signedIn &&
      (displayName.length < 2 || String(form.get("password") ?? "").length < 8)
    )
      return;
    try {
      if (
        signedIn &&
        !me.data?.profile?.display_name &&
        displayName.length >= 2
      )
        await saveProfile.submit({ display_name: displayName });
      await create.submit({
        id: postId,
        body: text,
        parent_id: parentId,
        guest_name: signedIn ? undefined : displayName,
        password: signedIn ? undefined : String(form.get("password") ?? ""),
        request_key: crypto.randomUUID(),
      });
      setNotice("댓글을 등록했습니다.");
      setReplyTo(null);
      target.reset();
      sessionStorage.removeItem(`travel-comment-draft:${postId}`);
      await comments.refetch();
    } catch {
      setNotice("");
    }
  }

  async function submitEdit(
    event: React.FormEvent<HTMLFormElement>,
    item: Comment,
  ) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      await edit.submit({
        id: item.id,
        version: item.version,
        body: String(form.get("body") ?? "").trim(),
        password: signedIn ? undefined : String(form.get("password") ?? ""),
      });
      setEditing(null);
      setNotice("댓글을 수정했습니다.");
      await comments.refetch();
    } catch {
      setNotice("");
    }
  }

  async function deleteComment(item: Comment) {
    const secret = signedIn
      ? undefined
      : window.prompt("댓글을 작성할 때 입력한 비밀번호를 입력해 주세요.");
    if (!signedIn && !secret) return;
    try {
      await remove.submit({
        id: item.id,
        version: item.version,
        password: secret || undefined,
      });
      setNotice("댓글을 삭제했습니다.");
      await comments.refetch();
    } catch {
      setNotice("");
    }
  }

  async function submitReport(
    event: React.FormEvent<HTMLFormElement>,
    item: Comment,
  ) {
    event.preventDefault();
    try {
      await report.submit({ id: item.id, reason: reportReason });
      setReporting(null);
      setNotice("신고가 접수되었습니다.");
    } catch {
      setNotice("");
    }
  }

  function renderComment(item: Comment, depth = 0): React.ReactNode {
    const children =
      comments.data?.filter((child) => child.parent_id === item.id) ?? [];
    const deleted = item.status === "deleted";
    return (
      <li
        key={item.id}
        className="border-border space-y-3 border-b py-5"
        style={{ marginLeft: depth ? Math.min(depth, 2) * 16 : 0 }}
      >
        <div className="flex flex-wrap items-baseline gap-x-3">
          <strong>{item.display_name}</strong>
          {item.is_staff && (
            <span className="text-primary text-xs">운영자</span>
          )}
          <time
            className="text-muted-foreground text-sm"
            dateTime={item.created_at}
          >
            {new Intl.DateTimeFormat("ko-KR", { dateStyle: "medium" }).format(
              new Date(item.created_at),
            )}
          </time>
        </div>
        {deleted ? (
          <p className="text-muted-foreground">삭제된 댓글입니다.</p>
        ) : editing === item.id ? (
          <form
            className="space-y-3"
            onSubmit={(event) => void submitEdit(event, item)}
          >
            <label className="block">
              댓글 수정
              <textarea
                name="body"
                required
                minLength={1}
                maxLength={1000}
                defaultValue={item.body}
                className="rounded-control bg-background mt-1 min-h-24 w-full border p-3"
              />
            </label>
            {!signedIn && (
              <label className="block">
                작성 시 비밀번호
                <input
                  name="password"
                  type="password"
                  required
                  minLength={8}
                  autoComplete="current-password"
                  className="rounded-control mt-1 min-h-11 border p-2"
                />
              </label>
            )}
            <div className="flex gap-2">
              <Button type="submit" disabled={edit.isPending}>
                수정 저장
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => setEditing(null)}
              >
                취소
              </Button>
            </div>
            {edit.error && <p role="alert">{errorMessage(edit.error)}</p>}
          </form>
        ) : (
          <p className="leading-relaxed whitespace-pre-wrap">{item.body}</p>
        )}
        {!deleted && (
          <div className="flex flex-wrap gap-2 text-sm">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setReplyTo(replyTo === item.id ? null : item.id)}
            >
              답글
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setEditing(item.id)}
            >
              수정
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => void deleteComment(item)}
            >
              삭제
            </Button>
            {signedIn ? (
              <Button
                type="button"
                variant="ghost"
                onClick={() =>
                  setReporting(reporting === item.id ? null : item.id)
                }
              >
                신고
              </Button>
            ) : (
              <Link
                className="inline-flex min-h-10 items-center px-3 underline"
                href={`/login?next=${encodeURIComponent(`/posts/${slug}#comments`)}`}
              >
                로그인 후 신고
              </Link>
            )}
          </div>
        )}
        {!deleted && reporting === item.id && (
          <form
            className="flex flex-wrap items-center gap-2"
            onSubmit={(event) => void submitReport(event, item)}
          >
            <label>
              신고 사유
              <select
                value={reportReason}
                onChange={(event) =>
                  setReportReason(event.target.value as typeof reportReason)
                }
                className="rounded-control bg-background ml-2 min-h-11 border px-2"
              >
                <option value="spam">스팸</option>
                <option value="abuse">욕설·괴롭힘</option>
                <option value="personal_information">개인정보</option>
                <option value="other">기타</option>
              </select>
            </label>
            <Button type="submit" disabled={report.isPending}>
              신고 접수
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => setReporting(null)}
            >
              취소
            </Button>
            {report.error && <p role="alert">{errorMessage(report.error)}</p>}
          </form>
        )}
        {!deleted && replyTo === item.id && (
          <form
            onSubmit={(event) => void submit(event, item.id)}
            className="rounded-panel bg-surface space-y-3 p-4"
          >
            <h3 className="font-medium">{item.display_name}님에게 답글</h3>
            <CommentFields
              signedIn={signedIn}
              profileName={me.data?.profile?.display_name}
            />
            <Button type="submit" disabled={create.isPending}>
              {create.isPending ? "등록 중…" : "답글 등록"}
            </Button>
            {create.error && <p role="alert">{errorMessage(create.error)}</p>}
          </form>
        )}
        {children.length > 0 && (
          <ul className="border-border ml-2 border-l-2 pl-3 sm:ml-6 sm:pl-5">
            {children.map((child) => renderComment(child, depth + 1))}
          </ul>
        )}
      </li>
    );
  }

  return (
    <section
      id="comments"
      aria-labelledby="comments-heading"
      className="border-border space-y-5 border-t pt-8"
    >
      <h2 id="comments-heading" className="font-serif text-2xl">
        댓글
        {typeof comments.data?.length === "number"
          ? ` · ${comments.data.length}`
          : ""}
      </h2>
      {comments.error && (
        <div role="alert" className="space-y-2">
          <p>{errorMessage(comments.error)}</p>
          <Button
            type="button"
            variant="outline"
            onClick={() => void comments.refetch()}
          >
            댓글 다시 불러오기
          </Button>
        </div>
      )}
      {comments.data?.length ? (
        <ul>
          {comments.data
            .filter((item) => !item.parent_id)
            .map((item) => renderComment(item))}
        </ul>
      ) : (
        !comments.isLoading && (
          <p className="text-muted-foreground">
            아직 댓글이 없습니다. 첫 번째 이야기를 남겨 주세요.
          </p>
        )
      )}
      {commentsEnabled ? (
        <form
          ref={composer}
          onSubmit={(event) => void submit(event)}
          className="rounded-panel border-border bg-surface space-y-3 border p-5"
        >
          <h3 className="font-serif text-xl">편지 남기기</h3>
          <CommentFields
            signedIn={signedIn}
            profileName={me.data?.profile?.display_name}
          />
          <p className="text-muted-foreground text-sm">
            카카오 로그인 전에 입력한 이름과 댓글은 이 탭에서 복원됩니다. 비회원
            관리 비밀번호는 저장되지 않아 다시 입력해야 합니다.
          </p>
          {!signedIn && (
            <Link
              href={`/login?next=${encodeURIComponent(`/posts/${slug}#comments`)}`}
              onClick={saveDraftBeforeLogin}
              className="inline-flex min-h-11 items-center underline underline-offset-4"
            >
              카카오 로그인 후 댓글 남기기
            </Link>
          )}
          <Button
            type="submit"
            disabled={create.isPending || saveProfile.isPending}
          >
            {create.isPending ? "등록 중…" : "댓글 등록"}
          </Button>
          {create.error && (
            <p role="alert">
              {errorMessage(create.error)}
              {create.error instanceof TravelApiError &&
              create.error.status === 429 &&
              create.error.retryAfter
                ? ` ${create.error.retryAfter}초 후 다시 시도해 주세요.`
                : ""}
            </p>
          )}
          {saveProfile.error && (
            <p role="alert">
              표시 이름을 저장하지 못했습니다. 다시 시도해 주세요.
            </p>
          )}
          {notice && <p role="status">{notice}</p>}
        </form>
      ) : (
        <p className="rounded-panel bg-surface text-muted-foreground p-4">
          이 글은 댓글을 닫았습니다. 이전 댓글은 계속 읽을 수 있습니다.
        </p>
      )}
    </section>
  );
}

function CommentFields({
  signedIn,
  profileName,
}: {
  signedIn: boolean;
  profileName?: string;
}) {
  return (
    <>
      {signedIn ? (
        !profileName && (
          <label className="block">
            표시 이름
            <input
              name="name"
              required
              minLength={2}
              maxLength={30}
              autoComplete="nickname"
              className="rounded-control bg-background mt-1 min-h-11 w-full max-w-sm border px-3"
            />
          </label>
        )
      ) : (
        <>
          <label className="block">
            이름
            <input
              name="name"
              required
              minLength={2}
              maxLength={30}
              autoComplete="nickname"
              className="rounded-control bg-background mt-1 min-h-11 w-full max-w-sm border px-3"
            />
          </label>
          <label className="block">
            댓글 관리 비밀번호
            <input
              name="password"
              type="password"
              required
              minLength={8}
              maxLength={128}
              autoComplete="new-password"
              className="rounded-control bg-background mt-1 min-h-11 w-full max-w-sm border px-3"
            />
            <span className="text-muted-foreground mt-1 block text-sm">
              비밀번호는 서버에서 확인하며 저장하거나 공개하지 않습니다.
            </span>
          </label>
        </>
      )}
      <label className="block">
        댓글
        <textarea
          name="body"
          required
          minLength={1}
          maxLength={1000}
          className="rounded-control bg-background mt-1 min-h-28 w-full border p-3"
        />
      </label>
    </>
  );
}
