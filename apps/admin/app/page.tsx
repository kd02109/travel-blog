import Link from "next/link";
import { Button } from "@repo/ui/button";
export default function AdminHome() {
  return (
    <main className="mx-auto max-w-4xl px-6 py-20">
      <p className="text-muted-foreground">오늘도 함께 걷다 · 관리</p>
      <h1 className="mt-4 text-4xl font-semibold">여행을 기록하는 공간</h1>
      <p className="my-8">
        글쓰기와 미리보기를 준비했습니다. 저장·발행 연결은 다음 구현 단계입니다.
      </p>
      <div className="flex flex-wrap gap-4">
        <Button asChild>
          <Link href="/write">글쓰기</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/login">로그인</Link>
        </Button>
        {process.env.NODE_ENV === "development" && (
          <Button asChild variant="outline">
            <Link href="/playground">에디터 체험</Link>
          </Button>
        )}
      </div>
    </main>
  );
}
