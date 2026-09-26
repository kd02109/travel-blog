"use client";

import { useMemo, useState } from "react";
import { createBrowserTravelApi } from "@repo/api-client/browser";
import { errorMessage, TravelApiError } from "@repo/api-client";
import { useTravelMutation, useTravelQuery } from "@repo/api-client/hooks";
import { Button } from "@repo/ui/button";

type Filter = "all" | "unanswered" | "reported" | "hidden";
const labels: Record<Filter, string> = {
  all: "전체",
  unanswered: "미답변",
  reported: "신고",
  hidden: "숨김",
};
const reasons: Record<string, string> = {
  spam: "스팸",
  abuse: "욕설·괴롭힘",
  personal_information: "개인정보",
  other: "기타",
};

export function CommentInbox({ siteId }: { siteId: string }) {
  const api = useMemo(() => createBrowserTravelApi(), []);
  const me = useTravelQuery(api, "me", {}, { siteId, actor: "session" });
  const scope = { siteId, actor: me.data?.user_id ?? "session" };
  const [filter, setFilter] = useState<Filter>("all");
  const [offset, setOffset] = useState(0);
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [reply, setReply] = useState("");
  const [feedback, setFeedback] = useState("");
  const comments = useTravelQuery(
    api,
    "admin.comments",
    { site_id: siteId, limit: 50, offset },
    scope,
    { enabled: !!me.data },
  );
  const reports = useTravelQuery(
    api,
    "admin.reports",
    { site_id: siteId, limit: 50, offset },
    scope,
    { enabled: !!me.data },
  );
  const moderate = useTravelMutation(api, "admin.comment.moderate", scope);
  const resolve = useTravelMutation(api, "admin.report.resolve", scope);
  const create = useTravelMutation(api, "comment.create", scope);
  const reportByComment = new Map(
    (reports.data ?? [])
      .filter((report) => report.status === "open")
      .map((report) => [report.comment_id, report]),
  );
  const unansweredIds = new Set(
    (comments.data ?? [])
      .filter(
        (comment) => comment.parent_id === null && comment.status === "visible",
      )
      .filter(
        (comment) =>
          !(comments.data ?? []).some(
            (reply) => reply.parent_id === comment.id && reply.is_staff,
          ),
      )
      .map((comment) => comment.id),
  );
  const visible = (comments.data ?? []).filter((comment) => {
    if (filter === "hidden") return comment.status === "hidden";
    if (filter === "reported") return reportByComment.has(comment.id);
    if (filter === "unanswered") return unansweredIds.has(comment.id);
    return true;
  });

  async function moderateComment(
    comment: NonNullable<typeof comments.data>[number],
    status: "visible" | "hidden",
  ) {
    setFeedback("");
    try {
      await moderate.submit({
        id: comment.id,
        site_id: siteId,
        version: comment.version,
        status,
      });
      setFeedback(
        status === "hidden" ? "댓글을 숨겼습니다." : "댓글을 복원했습니다.",
      );
    } catch (error) {
      setFeedback(
        error instanceof TravelApiError
          ? errorMessage(error)
          : "상태를 변경하지 못했습니다. 새로고침 후 다시 시도해 주세요.",
      );
    }
  }

  async function submitReply(
    comment: NonNullable<typeof comments.data>[number],
  ) {
    const rootId = comment.parent_id ?? comment.id;
    setFeedback("");
    try {
      await create.submit({
        id: comment.post_id,
        parent_id: rootId,
        body: reply,
        request_key: crypto.randomUUID(),
      });
      setReply("");
      setReplyTo(null);
      setFeedback("답글을 등록했습니다.");
    } catch (error) {
      setFeedback(
        error instanceof TravelApiError
          ? errorMessage(error)
          : "답글을 등록하지 못했습니다. 입력한 내용은 남겨 두었습니다.",
      );
    }
  }

  async function resolveReport(id: string, status: "resolved" | "dismissed") {
    try {
      await resolve.submit({ site_id: siteId, id, status });
      setFeedback(
        status === "resolved" ? "신고를 처리했습니다." : "신고를 기각했습니다.",
      );
    } catch (error) {
      setFeedback(
        error instanceof TravelApiError
          ? errorMessage(error)
          : "신고 상태를 변경하지 못했습니다.",
      );
    }
  }

  return (
    <main className="mx-auto max-w-5xl space-y-6 px-5 py-10 md:px-8">
      <header>
        <p className="text-muted-foreground">독자와 대화하기</p>
        <h1 className="font-editorial mt-2 text-3xl font-semibold">
          댓글 관리
        </h1>
      </header>
      <nav aria-label="댓글 필터" className="flex flex-wrap gap-2">
        {(Object.keys(labels) as Filter[]).map((key) => (
          <Button
            key={key}
            type="button"
            variant={filter === key ? "default" : "outline"}
            aria-pressed={filter === key}
            onClick={() => {
              setFilter(key);
              setOffset(0);
            }}
          >
            {labels[key]}
          </Button>
        ))}
      </nav>
      {feedback && (
        <p role="status" aria-live="polite">
          {feedback}
        </p>
      )}
      {me.isPending || comments.isPending || reports.isPending ? (
        <p role="status">댓글을 불러오고 있어요…</p>
      ) : me.isError || comments.isError || reports.isError ? (
        <section role="alert" className="rounded-panel space-y-3 border p-5">
          <p>{errorMessage(me.error ?? comments.error ?? reports.error)}</p>
          <Button
            variant="outline"
            onClick={() => {
              void me.refetch();
              void comments.refetch();
              void reports.refetch();
            }}
          >
            다시 불러오기
          </Button>
        </section>
      ) : visible.length ? (
        <ul className="space-y-4">
          {visible.map((comment) => {
            const report = reportByComment.get(comment.id);
            return (
              <li key={comment.id} className="rounded-panel border p-5">
                <article className="space-y-3">
                  <header className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <h2 className="font-semibold">{comment.display_name}</h2>
                      <p className="text-muted-foreground text-sm">
                        {comment.post_title} ·{" "}
                        {comment.parent_id ? "답글" : "댓글"} ·{" "}
                        {new Intl.DateTimeFormat("ko-KR", {
                          dateStyle: "medium",
                          timeStyle: "short",
                        }).format(new Date(comment.created_at))}
                      </p>
                    </div>
                    <span className="rounded-full border px-3 py-1 text-sm">
                      {comment.status === "visible"
                        ? "공개"
                        : comment.status === "hidden"
                          ? "숨김"
                          : "삭제"}
                    </span>
                  </header>
                  <p className="break-words whitespace-pre-wrap">
                    {comment.body || "삭제된 댓글입니다."}
                  </p>
                  {report && (
                    <aside
                      className="bg-muted rounded-lg p-3"
                      aria-label="열린 신고"
                    >
                      <p className="font-medium">
                        신고 사유: {reasons[report.reason] ?? "기타"}
                      </p>
                      <p className="text-muted-foreground text-sm">
                        접수{" "}
                        {new Intl.DateTimeFormat("ko-KR", {
                          dateStyle: "medium",
                        }).format(new Date(report.created_at))}
                      </p>
                      <div className="mt-2 flex gap-2">
                        <Button
                          variant="outline"
                          disabled={resolve.isPending}
                          onClick={() =>
                            void resolveReport(report.id, "resolved")
                          }
                        >
                          처리 완료
                        </Button>
                        <Button
                          variant="outline"
                          disabled={resolve.isPending}
                          onClick={() =>
                            void resolveReport(report.id, "dismissed")
                          }
                        >
                          기각
                        </Button>
                      </div>
                    </aside>
                  )}
                  <div className="flex flex-wrap gap-2">
                    {comment.status !== "deleted" && (
                      <Button
                        variant="outline"
                        disabled={moderate.isPending}
                        onClick={() =>
                          void moderateComment(
                            comment,
                            comment.status === "hidden" ? "visible" : "hidden",
                          )
                        }
                      >
                        {comment.status === "hidden" ? "복원" : "숨김"}
                      </Button>
                    )}
                    {comment.parent_id === null &&
                      comment.status === "visible" && (
                        <Button
                          variant="outline"
                          onClick={() => {
                            setReplyTo(
                              replyTo === comment.id ? null : comment.id,
                            );
                            setReply("");
                          }}
                        >
                          {replyTo === comment.id ? "답글 닫기" : "답글 작성"}
                        </Button>
                      )}
                  </div>
                  {replyTo === comment.id && (
                    <form
                      className="space-y-2"
                      onSubmit={(event) => {
                        event.preventDefault();
                        void submitReply(comment);
                      }}
                    >
                      <label htmlFor={`reply-${comment.id}`}>관리자 답글</label>
                      <textarea
                        id={`reply-${comment.id}`}
                        className="border-input bg-background min-h-28 w-full rounded-md border px-3 py-2"
                        value={reply}
                        onChange={(event) =>
                          setReply(event.currentTarget.value)
                        }
                        minLength={1}
                        maxLength={1000}
                        required
                      />
                      <Button type="submit" disabled={create.isPending}>
                        답글 등록
                      </Button>
                    </form>
                  )}
                </article>
              </li>
            );
          })}
        </ul>
      ) : (
        <section className="rounded-panel border p-8 text-center">
          <h2 className="font-semibold">
            {filter === "all"
              ? "아직 댓글이 없습니다"
              : `${labels[filter]} 댓글이 없습니다`}
          </h2>
        </section>
      )}
      <div className="flex justify-between">
        <Button
          variant="outline"
          disabled={offset === 0 || comments.isFetching}
          onClick={() => setOffset(Math.max(0, offset - 50))}
        >
          이전
        </Button>
        <Button
          variant="outline"
          disabled={(comments.data?.length ?? 0) < 50 || comments.isFetching}
          onClick={() => setOffset(offset + 50)}
        >
          다음
        </Button>
      </div>
    </main>
  );
}
