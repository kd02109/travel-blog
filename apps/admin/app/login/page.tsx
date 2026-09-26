import { authMessages } from "@repo/database/auth-flow";
import Link from "next/link";
import { LoginForm } from "./login-form";
export default async function Login({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; status?: string }>;
}) {
  const params = await searchParams;
  const key = params.error ?? params.status;
  const message = key
    ? Object.hasOwn(authMessages, key)
      ? authMessages[key]
      : authMessages.oauth
    : undefined;
  return (
    <main className="mx-auto max-w-xl px-6 py-20">
      <h1 className="mb-6 text-3xl">로그인</h1>
      {message && (
        <p role={params.error ? "alert" : "status"} className="mb-6">
          {message}
        </p>
      )}
      <LoginForm />
      <form action="/auth/signout" method="post" className="mt-6">
        <button className="underline" type="submit">
          현재 계정 로그아웃
        </button>
      </form>
      <Link className="mt-6 block underline" href="/">
        홈으로 돌아가기
      </Link>
    </main>
  );
}
