import Link from "next/link";

export function NotFoundPanel({ article = false }: { article?: boolean }) {
  return (
    <main className="mx-auto grid min-h-[70vh] w-full max-w-4xl place-items-center px-5 py-16">
      <section className="border-border w-full max-w-xl border bg-[#fafbf9] px-7 py-14 text-center sm:px-12">
        <span
          aria-hidden="true"
          className="mx-auto grid size-12 place-items-center rounded-full border border-[#d6ded8] text-[#7a4d3a]"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            className="size-6"
          >
            <circle cx="12" cy="12" r="9" />
            <path d="m15.6 8.4-2.1 5.1-5.1 2.1 2.1-5.1 5.1-2.1Z" />
          </svg>
        </span>
        <p className="text-muted-foreground mt-5 text-xs font-semibold tracking-[0.18em]">
          404 · NOT FOUND
        </p>
        <h1 className="mt-4 font-serif text-2xl sm:text-3xl">
          {article
            ? "이 여행 기록을 찾을 수 없어요"
            : "페이지를 찾을 수 없어요"}
        </h1>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          {article
            ? "주소가 바뀌었거나 공개되지 않은 글입니다."
            : "주소를 확인하거나 여행 기록에서 다시 찾아보세요."}
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link
            href="/posts"
            className="bg-foreground text-background inline-flex min-h-11 items-center justify-center px-5 text-sm font-semibold"
          >
            여행 기록 보기
          </Link>
          <Link
            href="/"
            className="border-foreground inline-flex min-h-11 items-center justify-center border px-5 text-sm font-semibold"
          >
            홈으로 가기
          </Link>
        </div>
      </section>
    </main>
  );
}
