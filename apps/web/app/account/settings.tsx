"use client";

import { useMemo, useState } from "react";
import { createBrowserTravelApi } from "@repo/api-client/browser";
import { errorMessage, TravelApiError } from "@repo/api-client";
import { useTravelMutation, useTravelQuery } from "@repo/api-client/hooks";
import { Button } from "@repo/ui/button";
import { Input } from "@repo/ui/input";

export function AccountSettings({
  siteId,
  email,
}: {
  siteId: string;
  email: string;
}) {
  const api = useMemo(() => createBrowserTravelApi(), []);
  const me = useTravelQuery(api, "me", {}, { siteId, actor: "session" });
  const scope = { siteId, actor: me.data?.user_id ?? "session" };
  const save = useTravelMutation(api, "profile.save", scope);
  const request = useTravelMutation(api, "account.delete.request", scope);
  const [editedName, setEditedName] = useState<string | null>(null);
  const displayName = editedName ?? me.data?.profile?.display_name ?? "";
  const [feedback, setFeedback] = useState("");

  async function saveProfile(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFeedback("");
    try {
      await save.submit({ display_name: displayName });
      setFeedback("별명을 저장했습니다.");
    } catch (error) {
      setFeedback(
        error instanceof TravelApiError
          ? errorMessage(error)
          : "별명을 저장하지 못했습니다.",
      );
    }
  }

  async function requestDeletion() {
    if (
      !window.confirm(
        "계정 삭제 요청을 제출할까요? 관리자가 댓글을 익명 처리한 뒤 계정을 삭제합니다.",
      )
    )
      return;
    setFeedback("");
    try {
      await request.submit({});
      setFeedback(
        "계정 삭제 요청을 접수했습니다. 처리 전까지 로그인과 계정 사용은 계속 가능합니다.",
      );
    } catch (error) {
      setFeedback(
        error instanceof TravelApiError
          ? errorMessage(error)
          : "요청을 접수하지 못했습니다. 다시 시도해 주세요.",
      );
    }
  }

  return (
    <main className="mx-auto max-w-2xl space-y-8 px-5 py-12 md:px-8">
      <header>
        <p className="text-muted-foreground">독자 계정</p>
        <h1 className="font-editorial mt-2 text-3xl font-semibold">내 계정</h1>
      </header>
      {feedback && (
        <p role="status" aria-live="polite">
          {feedback}
        </p>
      )}
      {me.isPending ? (
        <p role="status">계정 정보를 불러오고 있어요…</p>
      ) : me.isError ? (
        <section role="alert" className="rounded-panel space-y-3 border p-5">
          <p>{errorMessage(me.error)}</p>
          <Button variant="outline" onClick={() => void me.refetch()}>
            다시 확인하기
          </Button>
        </section>
      ) : (
        <>
          <section className="rounded-panel space-y-2 border p-5">
            <h2 className="font-semibold">로그인 계정</h2>
            <p>{email}</p>
          </section>
          <form
            onSubmit={saveProfile}
            className="rounded-panel space-y-4 border p-5"
          >
            <h2 className="font-semibold">별명</h2>
            <label htmlFor="display-name">댓글에 표시할 별명</label>
            <Input
              id="display-name"
              value={displayName}
              onChange={(event) => setEditedName(event.currentTarget.value)}
              minLength={2}
              maxLength={30}
              required
            />
            <Button
              type="submit"
              disabled={save.isPending || displayName.trim().length < 2}
            >
              별명 저장
            </Button>
          </form>
          <section className="rounded-panel space-y-3 border p-5">
            <h2 className="font-semibold">로그아웃</h2>
            <p className="text-muted-foreground">
              이 브라우저의 계정 세션을 종료합니다.
            </p>
            <form action="/auth/signout" method="post">
              <Button type="submit" variant="outline">
                로그아웃
              </Button>
            </form>
          </section>
          <section className="rounded-panel border-destructive/40 space-y-3 border p-5">
            <h2 className="font-semibold">계정 삭제 요청</h2>
            <p className="text-muted-foreground">
              요청을 접수하면 관리자가 기존 댓글의 계정 연결과 비회원 수정
              자격을 제거한 뒤 Supabase Auth 계정을 삭제합니다. 댓글 본문은 공개
              대화 기록으로 남고 작성자는 익명 독자로 표시됩니다. 처리 전까지
              계정을 계속 사용할 수 있습니다.
            </p>
            <Button
              type="button"
              variant="outline"
              disabled={request.isPending}
              onClick={() => void requestDeletion()}
            >
              {request.isPending ? "요청 중…" : "계정 삭제 요청"}
            </Button>
          </section>
        </>
      )}
    </main>
  );
}
