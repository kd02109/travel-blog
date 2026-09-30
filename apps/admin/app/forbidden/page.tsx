import { ForbiddenState } from "@repo/ui/feedback";
export default function Forbidden() {
  return (
    <main className="mx-auto max-w-4xl px-5 py-16 md:px-8">
      <ForbiddenState
        title="관리 권한이 없습니다"
        description="카카오 계정으로 로그인하고 운영자에게 사이트 편집 권한을 요청해 주세요. 권한이 회수된 경우 다시 권한을 받은 후 접근할 수 있습니다."
        action={
          <form action="/auth/signout" method="post">
            <button
              type="submit"
              className="rounded-control bg-primary text-primary-foreground inline-flex min-h-12 items-center px-5 text-base"
            >
              다른 계정으로 로그인
            </button>
          </form>
        }
      />
    </main>
  );
}
