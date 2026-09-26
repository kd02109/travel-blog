import Link from "next/link";
export default function PostNotFound() {
  return <main className="mx-auto w-full max-w-2xl px-5 py-20 text-center"><p className="text-muted-foreground text-sm tracking-widest">404 · NOT FOUND</p><h1 className="mt-4 font-serif text-3xl">이 여행 기록을 찾을 수 없어요</h1><p className="text-muted-foreground mt-4">주소가 바뀌었거나 공개되지 않은 글입니다.</p><div className="mt-7 flex justify-center gap-5"><Link className="min-h-12 inline-flex items-center underline underline-offset-4" href="/posts">여행 기록 둘러보기</Link><Link className="min-h-12 inline-flex items-center underline underline-offset-4" href="/">홈으로 가기</Link></div></main>;
}
