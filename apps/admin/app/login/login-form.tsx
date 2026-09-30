"use client";
import { useState } from "react";
import { authMessages } from "@repo/database/auth-flow";
import { createBrowserDatabase } from "@repo/database/browser";

function startErrorMessage(error: unknown) {
  if (!navigator.onLine) return authMessages.offline;
  const code =
    error && typeof error === "object" && "code" in error
      ? error.code
      : undefined;
  if (code === "provider_disabled" || code === "oauth_provider_not_supported")
    return authMessages.oauth_setup;
  if (code === "over_request_rate_limit") return authMessages.oauth_rate_limit;
  return authMessages.oauth_start;
}

export function LoginForm({
  notice,
}: {
  notice?: { message: string; kind: "error" | "status" };
}) {
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [attempted, setAttempted] = useState(false);
  async function login() {
    if (pending) return;
    setAttempted(true);
    setError("");
    if (
      !process.env.NEXT_PUBLIC_SUPABASE_URL ||
      !process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
    ) {
      setError(authMessages.oauth_setup);
      return;
    }
    setPending(true);
    try {
      const db = createBrowserDatabase();
      const result = await db.auth.signInWithOAuth({
        provider: "kakao",
        options: { redirectTo: `${window.location.origin}/auth/callback` },
      });
      if (result.error) throw result.error;
    } catch (error) {
      setError(startErrorMessage(error));
      setPending(false);
    }
  }
  const visibleMessage = error || (!attempted ? notice?.message : undefined);
  const isError = Boolean(error) || notice?.kind === "error";
  return (
    <>
      {visibleMessage && (
        <p
          role={isError ? "alert" : "status"}
          className={
            isError
              ? "mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900"
              : "mb-6 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-900"
          }
        >
          {visibleMessage}
        </p>
      )}
      <button
        type="button"
        onClick={login}
        disabled={pending}
        aria-busy={pending}
        className="inline-flex h-12 w-56 items-center justify-center gap-2 rounded-[12px] bg-[#FEE500] px-4 [font-family:system-ui] text-base leading-none font-normal text-black/85 transition-shadow focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-black enabled:hover:shadow-sm disabled:cursor-wait"
      >
        <svg
          aria-hidden="true"
          focusable="false"
          width="16"
          height="16"
          viewBox="61.5225 16.5225 12.956 12.956"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M68.001 16.5225C64.4222 16.5225 61.5225 19.0037 61.5225 22.0641C61.5225 24.0312 62.7219 25.7596 64.5292 26.7423L63.9181 29.2113C63.8954 29.285 63.9132 29.364 63.9619 29.4184C63.9975 29.457 64.0461 29.478 64.0931 29.478C64.1337 29.478 64.1742 29.464 64.2082 29.4341L66.834 27.5144C67.2117 27.5723 67.6007 27.6039 67.9994 27.6039C71.5767 27.6039 74.478 25.1226 74.478 22.0623C74.478 19.002 71.5783 16.5225 68.001 16.5225Z"
            fill="#000000"
          />
        </svg>
        <span>카카오 로그인</span>
      </button>
      {pending && (
        <span role="status" className="sr-only">
          카카오로 이동 중…
        </span>
      )}
    </>
  );
}
