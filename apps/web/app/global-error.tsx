"use client";
import { useEffect } from "react";
import Link from "next/link";
import { captureException } from "@sentry/nextjs";
export default function GlobalError({
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
    <html lang="ko">
      <head>
        <title>문제가 발생했어요 | 오늘도 함께 걷다</title>
      </head>
      <body
        suppressHydrationWarning
        style={{
          margin: 0,
          background: "#f6f5ef",
          color: "#173c42",
          fontFamily: "system-ui, sans-serif",
        }}
      >
        <main
          style={{
            display: "grid",
            minHeight: "100dvh",
            placeItems: "center",
            padding: 24,
          }}
        >
          <section
            role="alert"
            style={{
              width: "min(100%, 640px)",
              padding: "clamp(32px, 6vw, 64px)",
              border: "1px solid #d9e1df",
              background: "#fafbf9",
              textAlign: "center",
            }}
          >
            <span
              aria-hidden="true"
              style={{
                display: "grid",
                width: 48,
                height: 48,
                placeItems: "center",
                margin: "0 auto 20px",
                border: "1px solid #d6ded8",
                borderRadius: "50%",
                color: "#7a4d3a",
              }}
            >
              <svg
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
              >
                <circle cx="12" cy="12" r="9" />
                <path d="m15.6 8.4-2.1 5.1-5.1 2.1 2.1-5.1 5.1-2.1Z" />
              </svg>
            </span>
            <h1 style={{ margin: 0, fontSize: 28, fontWeight: 600 }}>
              잠시 문제가 발생했어요
            </h1>
            <p
              style={{ margin: "12px 0 0", color: "#5d7375", lineHeight: 1.7 }}
            >
              페이지를 여는 중 문제가 생겼습니다. 잠시 후 다시 시도해 주세요.
            </p>
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                alignItems: "center",
                justifyContent: "center",
                gap: 12,
                marginTop: 26,
              }}
            >
              <button
                type="button"
                onClick={retry}
                style={{
                  minHeight: 44,
                  padding: "0 18px",
                  border: "1px solid #173c42",
                  background: "#173c42",
                  color: "#fff",
                  cursor: "pointer",
                  font: "inherit",
                  fontSize: 13,
                  fontWeight: 600,
                }}
              >
                다시 시도
              </button>
              <Link
                href="/posts"
                style={{
                  display: "inline-flex",
                  minHeight: 44,
                  alignItems: "center",
                  padding: "0 18px",
                  border: "1px solid #173c42",
                  color: "inherit",
                  fontSize: 13,
                  fontWeight: 600,
                  textDecoration: "none",
                }}
              >
                여행 기록 보기
              </Link>
            </div>
          </section>
        </main>
      </body>
    </html>
  );
}
