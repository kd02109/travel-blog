"use client";

import { useMemo, useState } from "react";
import { createBrowserTravelApi } from "@repo/api-client/browser";
import { ApiMutationError } from "@repo/api-client/feedback";
import { useTravelMutation, useTravelQuery } from "@repo/api-client/hooks";
import { Button } from "@repo/ui/button";
import { Dialog } from "@repo/ui/dialog";
import { Input } from "@repo/ui/input";
import { PublicApiErrorState } from "../public-feedback";
import { AccountSkeleton } from "./account-skeleton";

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
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  async function saveProfile(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFeedback("");
    try {
      await save.submit({ display_name: displayName });
      setFeedback("별명을 저장했습니다.");
    } catch {
      setFeedback("");
    }
  }

  async function requestDeletion() {
    setFeedback("");
    try {
      await request.submit({});
      setDeleteDialogOpen(false);
      setFeedback(
        "계정 삭제 요청을 접수했습니다. 처리 전까지 로그인과 계정 사용은 계속 가능합니다.",
      );
    } catch {
      setFeedback("");
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
      {!me.data && me.isPending ? (
        <AccountSkeleton />
      ) : !me.data && me.error ? (
        <PublicApiErrorState
          size="tall"
          error={me.error}
          title="계정 정보를 확인하지 못했어요"
          onRetry={() => void me.refetch()}
          isRetrying={me.isFetching}
        />
      ) : (
        <>
          {me.error && (
            <PublicApiErrorState
              size="small"
              error={me.error}
              title="계정 정보를 새로 확인하지 못했어요"
              onRetry={() => void me.refetch()}
              isRetrying={me.isFetching}
            />
          )}
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
              {save.isPending ? "저장 중…" : "별명 저장"}
            </Button>
            {save.error && (
              <ApiMutationError
                error={save.error}
                title="별명을 저장하지 못했어요"
              />
            )}
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
              요청을 접수하면 관리자가 확인한 뒤 계정을 삭제합니다. 작성한
              댓글은 계속 공개되지만 이름은 &quot;삭제된 사용자&quot;로
              표시됩니다. 삭제 후에는 로그인하거나 기존 댓글을 수정할 수
              없습니다. 처리가 끝나기 전까지는 계정을 계속 사용할 수 있습니다.
            </p>
            <Button
              type="button"
              variant="outline"
              disabled={request.isPending}
              onClick={() => setDeleteDialogOpen(true)}
            >
              {request.isPending ? "요청 중…" : "계정 삭제 요청"}
            </Button>
            <Dialog
              open={deleteDialogOpen}
              onOpenChange={setDeleteDialogOpen}
              title="계정 삭제를 요청할까요?"
              description="관리자가 요청을 확인한 뒤 계정을 삭제합니다. 처리 전까지는 계정을 계속 사용할 수 있습니다."
            >
              <p className="text-muted-foreground mb-6 text-sm leading-relaxed">
                삭제 후에는 로그인하거나 기존 댓글을 수정할 수 없습니다. 댓글은
                남고 이름은 &quot;삭제된 사용자&quot;로 표시됩니다.
              </p>
              {request.error && (
                <div className="mb-5">
                  <ApiMutationError
                    error={request.error}
                    title="계정 삭제 요청을 접수하지 못했어요"
                  />
                </div>
              )}
              <div className="flex flex-wrap justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setDeleteDialogOpen(false)}
                  disabled={request.isPending}
                >
                  취소
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  onClick={() => void requestDeletion()}
                  disabled={request.isPending}
                >
                  {request.isPending ? "요청 중…" : "삭제 요청 접수"}
                </Button>
              </div>
            </Dialog>
          </section>
        </>
      )}
    </main>
  );
}
