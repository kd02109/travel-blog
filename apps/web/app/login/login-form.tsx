"use client";
import { useState } from "react";
import { createBrowserDatabase } from "@repo/database/browser";
import { Button } from "@repo/ui/button";
export function LoginForm() {
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  async function login() {
    if (pending) return;
    setError("");
    setPending(true);
    try {
      const db = createBrowserDatabase();
      const result = await db.auth.signInWithOAuth({
        provider: "kakao",
        options: { redirectTo: `${window.location.origin}/auth/callback` },
      });
      if (result.error) throw result.error;
    } catch {
      setError("로그인을 시작하지 못했습니다. 잠시 후 다시 시도해 주세요.");
      setPending(false);
    }
  }
  return (
    <>
      <Button onClick={login} disabled={pending}>
        {pending ? "카카오로 이동 중…" : "카카오로 로그인"}
      </Button>
      {error && (
        <p role="alert" className="mt-4">
          {error}
        </p>
      )}
    </>
  );
}
