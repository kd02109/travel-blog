"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useTravelMutation, useTravelQuery } from "@repo/api-client/hooks";
import { createBrowserTravelApi } from "@repo/api-client/browser";
import { ApiErrorState, ApiMutationError } from "@repo/api-client/feedback";
import { CATEGORIES } from "@repo/constants";
import { Button } from "@repo/ui/button";
import { Input } from "@repo/ui/input";
import { Select } from "@repo/ui/select";
import { Pagination } from "@repo/ui/pagination";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@repo/ui/table";

const pageSize = 12;
const statuses = [
  { value: "", label: "모든 상태" },
  { value: "draft", label: "작성 중" },
  { value: "published", label: "공개" },
  { value: "private", label: "비공개" },
  { value: "trashed", label: "휴지통" },
] as const;
const statusLabel: Record<string, string> = Object.fromEntries(
  statuses.slice(1).map((item) => [item.value, item.label]),
);

export function PostList({ siteId }: { siteId: string }) {
  const api = useMemo(() => createBrowserTravelApi(), []);
  const me = useTravelQuery(api, "me", {}, { siteId, actor: "session" });
  const [category, setCategory] = useState("");
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");
  const [settledSearch, setSettledSearch] = useState("");
  const [page, setPage] = useState(1);
  const [feedback, setFeedback] = useState("");
  const [mutationError, setMutationError] = useState<unknown>(null);
  const scope = { siteId, actor: me.data?.user_id ?? "session" };
  const listInput = {
    site_id: siteId,
    limit: pageSize,
    offset: (page - 1) * pageSize,
    ...(category
      ? { category: category as (typeof CATEGORIES)[number]["code"] }
      : {}),
    ...(status
      ? { status: status as "draft" | "published" | "private" | "trashed" }
      : {}),
    ...(settledSearch ? { search: settledSearch } : {}),
  };
  const posts = useTravelQuery(api, "admin.posts", listInput, scope, {
    enabled: !!me.data,
  });
  const statusMutation = useTravelMutation(api, "admin.post.status", scope);

  useEffect(() => {
    const timer = setTimeout(() => setSettledSearch(search.trim()), 250);
    return () => clearTimeout(timer);
  }, [search]);

  async function changeStatus(
    post: NonNullable<typeof posts.data>[number],
    next: "private" | "trashed",
  ) {
    const action =
      next === "trashed"
        ? "휴지통으로 이동"
        : post.status === "trashed"
          ? "비공개 상태로 복구"
          : "비공개로 전환";
    if (
      !window.confirm(
        `“${post.title || "제목 없는 글"}”을(를) ${action}할까요?`,
      )
    )
      return;
    setFeedback("");
    setMutationError(null);
    try {
      await statusMutation.submit({
        id: post.id,
        site_id: siteId,
        version: post.lock_version,
        status: next,
      });
      setFeedback(
        next === "trashed"
          ? "글을 휴지통으로 옮겼습니다."
          : post.status === "trashed"
            ? "글을 비공개 상태로 복구했습니다."
            : "글을 비공개로 전환했습니다.",
      );
    } catch (error) {
      setMutationError(error);
    }
  }

  return (
    <main className="mx-auto max-w-6xl space-y-6 px-5 py-10 md:px-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-muted-foreground">오늘도 함께 걷다 · 관리</p>
          <h1 className="font-editorial mt-2 text-3xl font-semibold">
            글 관리
          </h1>
        </div>
        <Button asChild>
          <Link href="/write">새 글 작성</Link>
        </Button>
      </header>
      <section
        aria-label="글 검색 및 필터"
        className="rounded-panel grid gap-3 border p-4 md:grid-cols-[minmax(14rem,1fr)_minmax(12rem,0.7fr)_minmax(12rem,0.7fr)]"
      >
        <label className="space-y-2">
          제목 또는 주소 검색
          <Input
            value={search}
            onChange={(event) => {
              setSearch(event.currentTarget.value);
              setPage(1);
            }}
            placeholder="검색어를 입력해 주세요"
          />
        </label>
        <label className="space-y-2">
          분류
          <Select
            value={category}
            onChange={(event) => {
              setCategory(event.currentTarget.value);
              setPage(1);
            }}
          >
            <option value="">모든 분류</option>
            {CATEGORIES.map((item) => (
              <option key={item.code} value={item.code}>
                {item.label}
              </option>
            ))}
          </Select>
        </label>
        <label className="space-y-2">
          상태
          <Select
            value={status}
            onChange={(event) => {
              setStatus(event.currentTarget.value);
              setPage(1);
            }}
          >
            {statuses.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </Select>
        </label>
      </section>
      {feedback && (
        <p role="status" aria-live="polite">
          {feedback}
        </p>
      )}
      {mutationError !== null && <ApiMutationError error={mutationError} />}
      {me.isPending ? (
        <p role="status">관리자 계정을 확인하고 있어요…</p>
      ) : me.isError ? (
        <ApiErrorState
          error={me.error}
          onRetry={() => void me.refetch()}
          isRetrying={me.isFetching}
        />
      ) : posts.isPending ? (
        <p role="status">글 목록을 불러오고 있어요…</p>
      ) : posts.isError ? (
        <ApiErrorState
          error={posts.error}
          onRetry={() => void posts.refetch()}
          isRetrying={posts.isFetching}
        />
      ) : posts.data?.length ? (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>제목</TableHead>
              <TableHead>분류</TableHead>
              <TableHead>상태</TableHead>
              <TableHead>수정한 날</TableHead>
              <TableHead>
                <span className="sr-only">작업</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {posts.data.map((post) => (
              <TableRow key={post.id}>
                <TableCell>
                  <Link
                    className="text-primary font-medium underline-offset-4 hover:underline"
                    href={`/write/${post.id}`}
                  >
                    {post.title || "제목 없는 글"}
                  </Link>
                  <span className="text-muted-foreground ml-2 text-sm">
                    {post.kind === "pdf" ? "PDF" : "글"}
                  </span>
                </TableCell>
                <TableCell>
                  {CATEGORIES.find((item) => item.code === post.category_code)
                    ?.label ?? "미분류"}
                </TableCell>
                <TableCell>{statusLabel[post.status] ?? post.status}</TableCell>
                <TableCell>
                  <time dateTime={post.updated_at}>
                    {new Intl.DateTimeFormat("ko-KR", {
                      dateStyle: "medium",
                    }).format(new Date(post.updated_at))}
                  </time>
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-2">
                    {post.status === "trashed" ? (
                      <Button
                        variant="outline"
                        disabled={statusMutation.isPending}
                        onClick={() => void changeStatus(post, "private")}
                      >
                        복구
                      </Button>
                    ) : (
                      <>
                        {post.status === "published" && (
                          <Button
                            variant="outline"
                            disabled={statusMutation.isPending}
                            onClick={() => void changeStatus(post, "private")}
                          >
                            비공개
                          </Button>
                        )}
                        <Button
                          variant="outline"
                          disabled={statusMutation.isPending}
                          onClick={() => void changeStatus(post, "trashed")}
                        >
                          휴지통
                        </Button>
                      </>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : (
        <section className="rounded-panel border px-6 py-16 text-center">
          <h2 className="font-editorial text-xl font-semibold">
            조건에 맞는 글이 없습니다
          </h2>
          <p className="text-muted-foreground mt-2">
            검색어나 분류·상태를 바꾸거나 새 기록을 시작해 보세요.
          </p>
          <Button asChild className="mt-5">
            <Link href="/write">새 글 작성</Link>
          </Button>
        </section>
      )}
      <Pagination
        page={page}
        hasNextPage={(posts.data?.length ?? 0) === pageSize}
        busy={posts.isFetching}
        onPageChange={setPage}
      />
    </main>
  );
}
