"use client";
import { useEffect } from "react";
import { captureException } from "@sentry/nextjs";
export default function GlobalError({
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
    <html lang="ko">
      <body>
        <h1>잠시 문제가 발생했습니다.</h1>
        <button onClick={reset}>다시 시도</button>
      </body>
    </html>
  );
}
