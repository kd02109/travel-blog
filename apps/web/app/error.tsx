"use client";

import { useEffect } from "react";
import Link from "next/link";
import { captureException } from "@sentry/nextjs";
import { PublicErrorState } from "./public-feedback";

export default function Error({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    captureException(error);
  }, [error]);

  return (
    <main className="mx-auto grid min-h-[70vh] w-full max-w-4xl place-items-center px-5 py-16">
      <PublicErrorState
        size="tall"
        className="w-full"
        title="잠시 문제가 발생했어요"
        description="페이지를 여는 중 문제가 생겼습니다. 잠시 후 다시 시도해 주세요."
        onRetry={retry}
        details={
          <div className="mt-3 flex flex-wrap justify-center gap-x-6 gap-y-2">
            <Link href="/posts" className="underline underline-offset-4">
              여행 기록 보기
            </Link>
            <Link href="/" className="underline underline-offset-4">
              홈으로 가기
            </Link>
          </div>
        }
      />
    </main>
  );
}
