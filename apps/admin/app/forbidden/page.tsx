import Link from "next/link";
import { ForbiddenState } from "@repo/ui/feedback";
export default function Forbidden() {
  return (
    <main className="mx-auto max-w-4xl px-5 py-16 md:px-8">
      <ForbiddenState
        title="관리 권한이 없습니다"
        description="운영자에게 사이트 편집 권한을 요청해 주세요. 권한이 회수된 경우 다시 권한을 받은 후 접근할 수 있습니다."
        action={
          <Link
            href="/"
            className="rounded-control bg-primary text-primary-foreground inline-flex min-h-12 items-center px-5 text-base"
          >
            관리 홈으로 돌아가기
          </Link>
        }
      />
      <form action="/auth/signout" method="post" className="my-6">
        <button type="submit" className="underline">
          현재 계정 로그아웃
        </button>
      </form>
    </main>
  );
}
