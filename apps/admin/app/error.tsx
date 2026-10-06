"use client";

import { useEffect } from "react";
import Link from "next/link";
import { captureException } from "@sentry/nextjs";
import { ErrorState } from "@repo/ui/feedback";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    captureException(error);
  }, [error]);

  return (
    <main className="mx-auto w-full max-w-2xl space-y-5 px-5 py-16">
      <ErrorState
        title="관리 화면에 문제가 생겼어요"
        description="페이지를 여는 중 문제가 생겼습니다. 잠시 후 다시 시도해 주세요."
        onRetry={reset}
      />
      <Link
        href="/posts"
        className="inline-flex min-h-12 items-center underline underline-offset-4"
      >
        글 관리로 가기
      </Link>
    </main>
  );
}
