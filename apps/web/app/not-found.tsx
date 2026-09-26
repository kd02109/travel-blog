import Link from "next/link";
export default function NotFound() {
  return <main className="mx-auto w-full max-w-2xl px-5 py-20 text-center"><p className="text-muted-foreground text-sm tracking-widest">404 · NOT FOUND</p><h1 className="mt-4 font-serif text-3xl">페이지를 찾을 수 없어요</h1><p className="text-muted-foreground mt-4">주소를 확인하거나 여행 기록에서 다시 찾아보세요.</p><Link className="mt-7 inline-flex min-h-12 items-center underline underline-offset-4" href="/">홈으로 가기</Link></main>;
}
