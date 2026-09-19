"use client";
import { useState } from "react";
import { createBrowserDatabase } from "@repo/database/browser";
import { Button } from "@repo/ui/button";
export default function Login() {
  const [error, setError] = useState("");
  async function login() {
    try {
      const db = createBrowserDatabase();
      const result = await db.auth.signInWithOAuth({
        provider: "kakao",
        options: { redirectTo: `${window.location.origin}/auth/callback` },
      });
      if (result.error) throw result.error;
    } catch {
      setError("로그인을 시작하지 못했습니다. 서비스 설정을 확인해 주세요.");
    }
  }
  return (
    <main className="mx-auto max-w-xl px-6 py-20">
      <h1 className="mb-6 text-3xl">로그인</h1>
      <Button onClick={login}>카카오로 로그인</Button>
      {error && (
        <p role="alert" className="mt-4">
          {error}
        </p>
      )}
    </main>
  );
}
