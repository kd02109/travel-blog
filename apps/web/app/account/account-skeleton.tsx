import { Skeleton } from "@repo/ui/skeleton";

export function AccountSkeleton() {
  return (
    <div role="status" aria-label="계정 정보를 불러오는 중">
      <span className="sr-only">계정 정보를 불러오는 중입니다.</span>
      <div aria-hidden="true" className="space-y-5">
        <section className="rounded-panel space-y-3 border p-5">
          <h2 className="font-semibold">로그인 계정</h2>
          <Skeleton className="h-6 w-3/5" />
        </section>
        <section className="rounded-panel space-y-4 border p-5">
          <h2 className="font-semibold">별명</h2>
          <Skeleton className="h-5 w-2/5" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-28" />
        </section>
        <section className="rounded-panel space-y-3 border p-5">
          <h2 className="font-semibold">로그아웃</h2>
          <Skeleton className="h-5 w-2/3" />
          <Skeleton className="h-10 w-24" />
        </section>
        <section className="rounded-panel border-destructive/40 space-y-3 border p-5">
          <h2 className="font-semibold">계정 삭제 요청</h2>
          <Skeleton className="h-5 w-full" />
          <Skeleton className="h-5 w-11/12" />
          <Skeleton className="h-5 w-4/5" />
          <Skeleton className="h-10 w-36" />
        </section>
      </div>
    </div>
  );
}

export function AccountPageLoading() {
  return (
    <main className="mx-auto max-w-2xl space-y-8 px-5 py-12 md:px-8">
      <header>
        <p className="text-muted-foreground">독자 계정</p>
        <h1 className="font-editorial mt-2 text-3xl font-semibold">내 계정</h1>
      </header>
      <AccountSkeleton />
    </main>
  );
}
