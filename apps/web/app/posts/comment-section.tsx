"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createBrowserDatabase } from "@repo/database/browser";
import { createBrowserTravelApi } from "@repo/api-client/browser";
import { ApiErrorState, ApiMutationError } from "@repo/api-client/feedback";
import { useTravelMutation, useTravelQuery } from "@repo/api-client/hooks";
import { TravelApiError } from "@repo/api-client";
import type { ActionOutput } from "@repo/contracts";
import { Button } from "@repo/ui/button";
import { Dialog } from "@repo/ui/dialog";

type Comment = ActionOutput<"comments.list">[number];
type CommentAction = "reply" | "edit" | "report" | "delete";

const actionLabels: Record<CommentAction, string> = {
  reply: "답글",
  edit: "수정",
  report: "신고",
  delete: "삭제",
};

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
  const [authUserId, setAuthUserId] = useState<string | null>(null);
  const signedIn = Boolean(authUserId);
  const scope = {
    siteId,
    actor: authUserId ? `reader:${authUserId}` : "public",
  };
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [createTarget, setCreateTarget] = useState<"composer" | "reply" | null>(
    null,
  );
  const [reporting, setReporting] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Comment | null>(null);
  const deletePasswordInput = useRef<HTMLInputElement>(null);
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
      .then(({ data }) => setAuthUserId(data.session?.user.id ?? null));
    const { data: listener } = auth.onAuthStateChange((_event, session) =>
      setAuthUserId(session?.user.id ?? null),
    );
    return () => listener.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!menuOpen) return;
    function onPointerDown(event: PointerEvent) {
      if (
        !(event.target instanceof Element) ||
        event.target
          .closest("[data-comment-menu]")
          ?.getAttribute("data-comment-menu") !== menuOpen
      )
        setMenuOpen(null);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      const trigger = Array.from(
        document.querySelectorAll<HTMLElement>("[data-comment-menu] > button"),
      ).find(
        (button) =>
          button.parentElement?.getAttribute("data-comment-menu") === menuOpen,
      );
      setMenuOpen(null);
      trigger?.focus();
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [menuOpen]);

  useEffect(() => {
    if (!deleteTarget?.is_guest) return;
    const timer = window.setTimeout(
      () => deletePasswordInput.current?.focus(),
      0,
    );
    return () => window.clearTimeout(timer);
  }, [deleteTarget]);

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

  function openLogin() {
    window.dispatchEvent(
      new CustomEvent("travel-open-login", {
        detail: { next: `/posts/${slug}#comments` },
      }),
    );
  }

  async function submit(
    event: React.FormEvent<HTMLFormElement>,
    parentId: string | null = null,
  ) {
    event.preventDefault();
    if (create.isPending || saveProfile.isPending) return;
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
    setCreateTarget(parentId ? "reply" : "composer");
    create.reset();
    saveProfile.reset();
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
      setNotice("");
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
        password: item.is_guest
          ? String(form.get("password") ?? "")
          : undefined,
      });
      setEditing(null);
      setNotice("댓글을 수정했습니다.");
      await comments.refetch();
    } catch {
      setNotice("");
    }
  }

  async function submitDelete(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!deleteTarget) return;
    const password = deleteTarget.is_guest
      ? String(new FormData(event.currentTarget).get("password") ?? "")
      : undefined;
    try {
      await remove.submit({
        id: deleteTarget.id,
        version: deleteTarget.version,
        password,
      });
      setDeleteTarget(null);
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

  function chooseAction(action: CommentAction, item: Comment) {
    setMenuOpen(null);
    if (action === "reply") {
      create.reset();
      setCreateTarget(null);
      setEditing(null);
      setReporting(null);
      setReplyTo(replyTo === item.id ? null : item.id);
    } else if (action === "edit") {
      edit.reset();
      setReplyTo(null);
      setReporting(null);
      setEditing(item.id);
    } else if (action === "delete") {
      remove.reset();
      setDeleteTarget(item);
    } else if (!signedIn) {
      openLogin();
    } else {
      report.reset();
      setReplyTo(null);
      setEditing(null);
      setReporting(reporting === item.id ? null : item.id);
    }
  }

  function renderComment(item: Comment, depth = 0): React.ReactNode {
    const children =
      comments.data?.filter((child) => child.parent_id === item.id) ?? [];
    const deleted = item.status === "deleted";
    const canManage = item.can_manage || item.is_guest;
    const actions: CommentAction[] = ["reply"];
    if (canManage) actions.push("edit");
    if (!item.can_manage) actions.push("report");
    if (canManage) actions.push("delete");
    return (
      <li
        key={item.id}
        className="border-border space-y-3 border-b py-5"
        style={{ marginLeft: depth ? Math.min(depth, 2) * 16 : 0 }}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1 pt-1">
            <strong>{item.display_name}</strong>
            {item.is_staff && (
              <span className="text-primary text-xs">운영자</span>
            )}
            <time
              className="text-muted-foreground text-sm"
              dateTime={item.created_at}
            >
              {new Intl.DateTimeFormat("ko-KR", {
                dateStyle: "medium",
              }).format(new Date(item.created_at))}
            </time>
          </div>
          {!deleted && (
            <div className="relative shrink-0" data-comment-menu={item.id}>
              <button
                type="button"
                aria-label={`${item.display_name} 댓글 더보기`}
                aria-expanded={menuOpen === item.id}
                aria-controls={`comment-actions-${item.id}`}
                onClick={() =>
                  setMenuOpen(menuOpen === item.id ? null : item.id)
                }
                className="group inline-flex size-12 items-center justify-center rounded-full"
              >
                <span className="bg-muted text-muted-foreground group-hover:bg-accent group-hover:text-foreground inline-flex size-8 items-center justify-center rounded-full transition-colors">
                  <ActionIcon action="more" />
                </span>
              </button>
              {menuOpen === item.id && (
                <div
                  id={`comment-actions-${item.id}`}
                  aria-label={`${item.display_name} 댓글 작업`}
                  className={`border-border bg-surface rounded-panel absolute top-full right-0 z-20 mt-2 border p-2 shadow-[0_12px_32px_rgb(23_60_66_/_16%)] ${actions.length > 2 ? "w-48" : "w-28"}`}
                >
                  <div
                    className={`grid gap-1.5 ${actions.length > 2 ? "grid-cols-2" : "grid-cols-1"}`}
                  >
                    {actions.map((action) => (
                      <button
                        key={action}
                        type="button"
                        onClick={() => chooseAction(action, item)}
                        className="border-border bg-background text-foreground hover:border-primary/30 hover:bg-muted rounded-control inline-flex min-h-12 items-center justify-between gap-1 border px-2 text-sm transition-colors"
                      >
                        <span>{actionLabels[action]}</span>
                        <ActionIcon action={action} />
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
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
            {item.is_guest && (
              <label className="block">
                작성 시 비밀번호
                <input
                  name="password"
                  type="password"
                  required
                  minLength={8}
                  maxLength={128}
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
            {edit.error && (
              <ApiMutationError
                error={edit.error}
                title="댓글을 수정하지 못했어요"
              />
            )}
            {edit.error instanceof TravelApiError &&
              edit.error.status === 409 && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => void comments.refetch()}
                >
                  최신 내용 확인
                </Button>
              )}
          </form>
        ) : (
          <p className="leading-relaxed whitespace-pre-wrap">{item.body}</p>
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
            {report.error && (
              <ApiMutationError
                error={report.error}
                title="신고를 접수하지 못했어요"
              />
            )}
          </form>
        )}
        {!deleted && replyTo === item.id && (
          <form
            onSubmit={(event) => void submit(event, item.parent_id ?? item.id)}
            className="rounded-panel bg-surface space-y-3 p-4"
          >
            <h3 className="font-medium">
              {item.parent_id
                ? "이 대화에 답글"
                : `${item.display_name}님에게 답글`}
            </h3>
            <CommentFields
              signedIn={signedIn}
              profileName={me.data?.profile?.display_name}
            />
            <Button type="submit" disabled={create.isPending}>
              {create.isPending ? "등록 중…" : "답글 등록"}
            </Button>
            {create.error && createTarget === "reply" && (
              <ApiMutationError
                error={create.error}
                title="답글을 등록하지 못했어요"
              />
            )}
            {createTarget === "reply" &&
              create.error instanceof TravelApiError &&
              create.error.status === 409 && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => void comments.refetch()}
                >
                  최신 내용 확인
                </Button>
              )}
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
      {notice && <p role="status">{notice}</p>}
      {comments.error && (
        <ApiErrorState
          error={comments.error}
          title="댓글을 불러오지 못했어요"
          onRetry={() => void comments.refetch()}
          isRetrying={comments.isFetching}
        />
      )}
      {me.error && (
        <ApiErrorState
          error={me.error}
          title="계정 이름을 확인하지 못했어요"
          onRetry={() => void me.refetch()}
          isRetrying={me.isFetching}
        />
      )}
      {comments.data?.length ? (
        <ul>
          {comments.data
            .filter((item) => !item.parent_id)
            .map((item) => renderComment(item))}
        </ul>
      ) : (
        comments.isSuccess && (
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
            <button
              type="button"
              onClick={() => {
                saveDraftBeforeLogin();
                openLogin();
              }}
              className="inline-flex min-h-11 items-center underline underline-offset-4"
            >
              카카오 로그인 후 댓글 남기기
            </button>
          )}
          <Button
            type="submit"
            disabled={create.isPending || saveProfile.isPending}
          >
            {create.isPending ? "등록 중…" : "댓글 등록"}
          </Button>
          {create.error && createTarget === "composer" && (
            <ApiMutationError
              error={create.error}
              title="댓글을 등록하지 못했어요"
            />
          )}
          {createTarget === "composer" &&
            create.error instanceof TravelApiError &&
            create.error.status === 409 && (
              <Button
                type="button"
                variant="outline"
                onClick={() => void comments.refetch()}
              >
                최신 내용 확인
              </Button>
            )}
          {saveProfile.error && (
            <ApiMutationError
              error={saveProfile.error}
              title="표시 이름을 저장하지 못했어요"
            />
          )}
        </form>
      ) : (
        <p className="rounded-panel bg-surface text-muted-foreground p-4">
          이 글은 댓글을 닫았습니다. 이전 댓글은 계속 읽을 수 있습니다.
        </p>
      )}
      <Dialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
        title="댓글 삭제"
        description={
          deleteTarget?.is_guest
            ? "작성할 때 설정한 댓글 관리 비밀번호를 입력해 주세요."
            : "이 댓글을 삭제할까요? 삭제한 내용은 복구할 수 없습니다."
        }
      >
        <form
          onSubmit={(event) => void submitDelete(event)}
          className="space-y-5"
        >
          {deleteTarget?.is_guest && (
            <label className="block font-medium">
              댓글 관리 비밀번호
              <input
                ref={deletePasswordInput}
                name="password"
                type="password"
                required
                minLength={8}
                maxLength={128}
                autoComplete="current-password"
                className="rounded-control bg-background mt-2 min-h-12 w-full border px-3"
              />
            </label>
          )}
          {remove.error && (
            <ApiMutationError
              error={remove.error}
              title="댓글을 삭제하지 못했어요"
            />
          )}
          {remove.error instanceof TravelApiError &&
            remove.error.status === 409 && (
              <Button
                type="button"
                variant="outline"
                onClick={() => void comments.refetch()}
              >
                최신 내용 확인
              </Button>
            )}
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setDeleteTarget(null)}
            >
              취소
            </Button>
            <Button
              type="submit"
              variant="destructive"
              disabled={remove.isPending}
            >
              {remove.isPending ? "삭제 중…" : "삭제"}
            </Button>
          </div>
        </form>
      </Dialog>
    </section>
  );
}

function ActionIcon({ action }: { action: CommentAction | "more" }) {
  const iconClass = "text-muted-foreground size-4 shrink-0";
  if (action === "more")
    return (
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        fill="currentColor"
        className="size-5"
      >
        <circle cx="5" cy="12" r="1.7" />
        <circle cx="12" cy="12" r="1.7" />
        <circle cx="19" cy="12" r="1.7" />
      </svg>
    );
  const paths: Record<CommentAction, React.ReactNode> = {
    reply: (
      <path d="M21 11.5a8.5 8.5 0 0 1-8.5 8.5 9 9 0 0 1-4-.9L3 21l1.9-5.5a9 9 0 0 1-.9-4A8.5 8.5 0 0 1 12.5 3 8.5 8.5 0 0 1 21 11.5Z" />
    ),
    edit: (
      <>
        <path d="M12 20h9" />
        <path d="M4 16.5V20h3.5L18.8 8.7l-3.5-3.5L4 16.5Z" />
        <path d="m13.7 6.8 3.5 3.5" />
      </>
    ),
    report: (
      <>
        <path d="m10.3 4.3-8 14A1.8 1.8 0 0 0 3.9 21h16.2a1.8 1.8 0 0 0 1.6-2.7l-8-14a1.9 1.9 0 0 0-3.4 0Z" />
        <path d="M12 9v4" />
        <path d="M12 17h.01" />
      </>
    ),
    delete: (
      <>
        <path d="M3 6h18M8 6V4h8v2M5 6l1 14h12l1-14" />
        <path d="M10 10v6M14 10v6" />
      </>
    ),
  };
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={iconClass}
    >
      {paths[action]}
    </svg>
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
