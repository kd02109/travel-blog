import { authMessages } from "@repo/database/auth-flow";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getAdminAccess } from "../../lib/auth";
import { LoginForm } from "./login-form";
export default async function Login({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; status?: string }>;
}) {
  const access = await getAdminAccess();
  const params = await searchParams;
  if (
    params.error === "signout" &&
    (access.status === "authorized" || access.status === "forbidden")
  ) {
    return (
      <main className="mx-auto max-w-xl px-6 py-20">
        <h1 className="text-3xl">로그아웃을 완료하지 못했습니다</h1>
        <p
          role="alert"
          className="mt-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900"
        >
          {authMessages.signout}
        </p>
        <form action="/auth/signout" method="post" className="mt-6">
          <button
            type="submit"
            className="rounded-control bg-primary text-primary-foreground inline-flex min-h-12 items-center px-5 text-base"
          >
            로그아웃 다시 시도
          </button>
        </form>
        <Link
          href={access.status === "authorized" ? "/posts" : "/forbidden"}
          className="mt-6 inline-block underline"
        >
          이전 화면으로 돌아가기
        </Link>
      </main>
    );
  }
  if (access.status === "authorized") redirect("/posts");
  if (access.status === "forbidden") redirect("/forbidden");
  const error =
    typeof params.error === "string"
      ? params.error
      : access.status === "unavailable" && params.status !== "signed_out"
        ? "unavailable"
        : undefined;
  const message = error
    ? Object.hasOwn(authMessages, error)
      ? authMessages[error]
      : authMessages.oauth
    : params.status === "signed_out"
      ? authMessages.signed_out
      : undefined;
  return (
    <main className="mx-auto max-w-xl px-6 py-20">
      <h1 className="text-3xl">관리자 로그인</h1>
      <p className="text-muted-foreground mt-3 mb-6">
        관리자 페이지는 카카오 계정으로만 로그인할 수 있습니다.
      </p>
      <LoginForm
        notice={
          message ? { message, kind: error ? "error" : "status" } : undefined
        }
      />
    </main>
  );
}
