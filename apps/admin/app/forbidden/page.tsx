import Link from "next/link";
export default function Forbidden() {
  return (
    <main className="p-12">
      <h1>관리 권한이 없습니다.</h1>
      <p>운영자에게 사이트 편집 권한을 요청해 주세요.</p>
      <p>권한이 회수된 경우에는 다시 권한을 받은 후 접근할 수 있습니다.</p>
      <form action="/auth/signout" method="post" className="my-6">
        <button type="submit" className="underline">
          현재 계정 로그아웃
        </button>
      </form>
      <Link href="/" className="underline">
        관리 홈으로 돌아가기
      </Link>
    </main>
  );
}
