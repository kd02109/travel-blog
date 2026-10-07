"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { PublicApiErrorState } from "../public-feedback";

export function AccountLoadError() {
  const router = useRouter();
  const [isRefreshing, startTransition] = useTransition();

  return (
    <main className="mx-auto w-full max-w-2xl space-y-6 px-5 py-16">
      <header>
        <p className="text-muted-foreground">독자 계정</p>
        <h1 className="font-editorial mt-2 text-3xl font-semibold">내 계정</h1>
      </header>
      <PublicApiErrorState
        size="tall"
        error={new Error("account_site_unavailable")}
        title="계정 정보를 불러오지 못했어요"
        description="연결을 확인한 뒤 다시 시도해 주세요."
        onRetry={() => startTransition(() => router.refresh())}
        isRetrying={isRefreshing}
      />
      <Link
        href="/"
        className="inline-flex min-h-12 items-center underline underline-offset-4"
      >
        홈으로 가기
      </Link>
    </main>
  );
}
