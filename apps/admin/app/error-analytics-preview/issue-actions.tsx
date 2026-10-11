"use client";
import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createBrowserTravelApi } from "@repo/api-client/browser";
import { TravelApiError } from "@repo/api-client";
import { useTravelMutation } from "@repo/api-client/hooks";
import { ApiMutationError } from "@repo/api-client/feedback";
import { Button } from "@repo/ui/button";
export function IssueActions({
  siteId,
  actorId,
  id,
  count,
  status,
}: {
  siteId: string;
  actorId: string;
  id: string;
  count: number;
  status: "open" | "resolved" | "ignored";
}) {
  const router = useRouter();
  const api = useMemo(() => createBrowserTravelApi(), []);
  const scope = { siteId, actor: actorId };
  const change = useTravelMutation(api, "admin.error.status", scope);
  const remove = useTravelMutation(api, "admin.error.delete", scope);
  const busy = useRef(false);
  const [refreshing, startTransition] = useTransition();
  const [error, setError] = useState<unknown>(null);
  const [message, setMessage] = useState("");
  const [note, setNote] = useState("");
  const [release, setRelease] = useState("");
  const pending = change.isPending || remove.isPending || refreshing;
  async function submit(action: "status" | "delete") {
    if (busy.current || pending) return;
    if (
      action === "delete" &&
      !window.confirm(
        `이슈 ${id}와 연결된 발생 기록을 영구 삭제할까요? 되돌릴 수 없습니다. 발송 이력과 관리 감사 기록은 유지됩니다.`,
      )
    )
      return;
    busy.current = true;
    setError(null);
    setMessage("");
    try {
      const input = { site_id: siteId, id, expected_count: count };
      if (action === "delete") {
        await remove.submit(input);
        startTransition(() => {
          router.replace("/error-analytics-preview");
          router.refresh();
        });
      } else {
        await change.submit({
          ...input,
          status: status === "resolved" ? "open" : "resolved",
          ...(status !== "resolved"
            ? { note, ...(release ? { resolved_release: release } : {}) }
            : {}),
        });
        setMessage(
          status === "resolved"
            ? "다시 열었습니다."
            : "해결됨으로 처리했습니다. 같은 오류가 재발하면 자동으로 다시 열립니다.",
        );
        startTransition(() => router.refresh());
      }
    } catch (caught) {
      setError(caught);
    } finally {
      busy.current = false;
    }
  }
  return (
    <section className="space-y-3" aria-label="오류 처리">
      {status !== "resolved" && (
        <div className="grid gap-3">
          <label>
            해결 배포 릴리스 (선택)
            <input
              className="block rounded border p-2"
              value={release}
              onChange={(e) => setRelease(e.target.value)}
              maxLength={80}
              pattern="[A-Za-z0-9._-]+"
              placeholder="예: git commit SHA"
            />
          </label>
          <label>
            해결 메모 (선택·500자)
            <textarea
              className="block w-full rounded border p-2"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={500}
              placeholder="수정 요약과 PR 번호. 개인정보·비밀키는 입력하지 마세요."
            />
          </label>
          <p className="text-sm">
            해결 메모는 마스킹 후 이슈와 함께 보관됩니다. 이벤트의 14일 삭제
            정책과 별개입니다.
          </p>
        </div>
      )}
      <div className="flex flex-wrap gap-3">
        <Button disabled={pending} onClick={() => void submit("status")}>
          {status === "resolved" ? "다시 열기" : "해결됨 처리"}
        </Button>
        <Button
          variant="destructive"
          disabled={pending}
          onClick={() => void submit("delete")}
        >
          이슈 삭제
        </Button>
        <Button
          variant="outline"
          disabled={pending}
          onClick={() => startTransition(() => router.refresh())}
        >
          새로고침
        </Button>
      </div>
      <p className="text-muted-foreground text-sm">
        삭제하면 이슈와 연결된 발생 기록이 영구 삭제됩니다. 발송 이력·관리 감사
        기록은 유지됩니다. 이미 발송 중인 메일이 있으면 잠시 후 다시 시도하세요.
      </p>
      {pending && <p role="status">처리 중…</p>}
      {message && <p role="status">{message}</p>}
      {error !== null && (
        <>
          <ApiMutationError error={error} />
          {error instanceof TravelApiError && error.status === 409 && (
            <p role="alert">
              새 발생 기록 또는 발송 중인 메일이 있습니다. 새로고침하여 최신
              내용을 확인한 뒤 다시 처리해 주세요.
            </p>
          )}
        </>
      )}
    </section>
  );
}
