"use client";
import { useEffect } from "react";
import Link from "next/link";
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
      <head>
        <title>문제가 발생했어요 | 오늘도 함께 걷다</title>
      </head>
      <body
        suppressHydrationWarning
        style={{
          margin: 0,
          background: "#f7f8f4",
          color: "#173c42",
          fontFamily: "system-ui, sans-serif",
        }}
      >
        <main style={{ maxWidth: 640, margin: "12vh auto", padding: 24 }}>
          <h1 style={{ fontSize: 28 }}>잠시 문제가 발생했어요</h1>
          <p style={{ lineHeight: 1.7 }}>
            페이지를 여는 중 문제가 생겼습니다. 잠시 후 다시 시도해 주세요.
          </p>
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 16,
              marginTop: 24,
            }}
          >
            <button
              type="button"
              onClick={reset}
              style={{
                minHeight: 48,
                padding: "0 20px",
                border: "1px solid #173c42",
                borderRadius: 8,
                background: "#173c42",
                color: "white",
                cursor: "pointer",
                font: "inherit",
              }}
            >
              다시 시도
            </button>
            <Link
              href="/"
              style={{
                minHeight: 48,
                display: "inline-flex",
                alignItems: "center",
                color: "inherit",
              }}
            >
              홈으로 가기
            </Link>
          </div>
        </main>
      </body>
    </html>
  );
}
