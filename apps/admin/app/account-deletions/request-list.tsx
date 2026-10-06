"use client";

import { useMemo, useState } from "react";
import { createBrowserTravelApi } from "@repo/api-client/browser";
import { useTravelMutation, useTravelQuery } from "@repo/api-client/hooks";
import { ApiErrorState, ApiMutationError } from "@repo/api-client/feedback";
import { Button } from "@repo/ui/button";

export function AccountDeletionInbox({ siteId }: { siteId: string }) {
  const api = useMemo(() => createBrowserTravelApi(), []);
  const me = useTravelQuery(api, "me", {}, { siteId, actor: "session" });
  const scope = { siteId, actor: me.data?.user_id ?? "session" };
  const list = useTravelQuery(
    api,
    "admin.account.deletions",
    { site_id: siteId },
    scope,
    { enabled: !!me.data },
  );
  const anonymize = useTravelMutation(
    api,
    "admin.account.deletion.anonymize",
    scope,
  );
  const complete = useTravelMutation(
    api,
    "admin.account.deletion.complete",
    scope,
  );
  const [feedback, setFeedback] = useState("");
  const [mutationError, setMutationError] = useState<unknown>(null);

  async function run(id: string, mode: "anonymize" | "complete") {
    setFeedback("");
    setMutationError(null);
    try {
      if (mode === "anonymize") {
        const result = await anonymize.submit({ site_id: siteId, id });
        setFeedback(
          `댓글 ${result.comments_anonymized}개에서 계정 연결과 비회원 관리 자격을 제거했습니다. 이제 안내된 Supabase Auth 계정을 삭제한 뒤 완료 처리해 주세요.`,
        );
      } else {
        await complete.submit({ site_id: siteId, id });
        setFeedback("삭제 요청을 완료 처리했습니다.");
      }
    } catch (error) {
      setMutationError(error);
    }
  }

  return (
    <main className="mx-auto max-w-5xl space-y-6 px-5 py-10 md:px-8">
      <header>
        <p className="text-muted-foreground">독자 개인정보 처리</p>
        <h1 className="font-editorial mt-2 text-3xl font-semibold">
          계정 삭제 요청
        </h1>
      </header>
      <section className="rounded-panel space-y-3 border p-5">
        <h2 className="font-semibold">처리 순서</h2>
        <ol className="list-inside list-decimal space-y-1">
          <li>
            요청별로 “댓글 익명 처리”를 실행합니다. 댓글 본문은 남고 작성자 연결
            및 비회원 수정 자격증명은 제거됩니다.
          </li>
          <li>
            <a
              className="underline"
              href="https://supabase.com/dashboard/project/kqbqoopqomrwozpqgono/auth/users"
              target="_blank"
              rel="noreferrer"
            >
              Supabase Authentication 사용자 목록
            </a>
            에서 표시된 이메일 계정을 삭제합니다.
          </li>
          <li>
            사용자 삭제가 성공해 요청이 “익명 처리 완료” 상태로 바뀐 것을 확인한
            뒤 완료 표시를 누릅니다.
          </li>
        </ol>
      </section>
      {feedback && (
        <p role="status" aria-live="polite">
          {feedback}
        </p>
      )}
      {mutationError !== null && <ApiMutationError error={mutationError} />}
      {me.isPending || (me.isSuccess && list.isPending) ? (
        <p role="status">요청을 불러오고 있어요…</p>
      ) : me.isError || list.isError ? (
        <ApiErrorState
          error={me.error ?? list.error}
          onRetry={() => {
            void me.refetch();
            void list.refetch();
          }}
          isRetrying={me.isFetching || list.isFetching}
        />
      ) : list.data?.length ? (
        <ul className="space-y-4">
          {list.data.map((item) => (
            <li key={item.id} className="rounded-panel space-y-3 border p-5">
              <div>
                <p className="font-medium">
                  {item.email ?? "계정을 찾을 수 없습니다"}
                </p>
                <p className="text-muted-foreground text-sm">
                  요청{" "}
                  {new Intl.DateTimeFormat("ko-KR", {
                    dateStyle: "medium",
                    timeStyle: "short",
                  }).format(new Date(item.requested_at))}{" "}
                  · {item.status === "pending" ? "처리 대기" : "익명 처리 완료"}
                </p>
              </div>
              {item.status === "pending" ? (
                <Button
                  variant="outline"
                  disabled={anonymize.isPending}
                  onClick={() => void run(item.id, "anonymize")}
                >
                  댓글 익명 처리
                </Button>
              ) : (
                <Button
                  variant="outline"
                  disabled={complete.isPending || !!item.user_id}
                  onClick={() => void run(item.id, "complete")}
                >
                  계정 삭제 완료 표시
                </Button>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <section className="rounded-panel border p-8 text-center">
          <h2 className="font-semibold">대기 중인 요청이 없습니다</h2>
        </section>
      )}
    </main>
  );
}
