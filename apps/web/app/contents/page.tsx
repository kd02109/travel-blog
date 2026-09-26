import Link from "next/link";
import { CATEGORIES } from "@repo/constants";

const descriptions: Record<(typeof CATEGORIES)[number]["code"], string> = {
  "day-walk": "하루면 충분한, 함께 걷기 좋은 길.",
  "overnight-trip": "하룻밤 더 머물며 발견한 풍경들.",
  "food-cafe": "여행을 오래 기억하게 하는 한 끼와 한 잔.",
  "stay-review": "하루의 끝에 편안히 머문 곳.",
  "itinerary-pdf": "우리의 여행 계획을 한 장씩 나눕니다.",
};

export default function Contents() {
  return <main className="mx-auto w-full max-w-[var(--content-max)] px-5 py-12 md:px-8 md:py-16 xl:px-16"><p className="text-muted-foreground text-sm tracking-widest">JOURNAL GUIDE</p><h1 className="mt-3 font-serif text-3xl sm:text-4xl">여행책 목차</h1><p className="text-muted-foreground mt-4 max-w-2xl text-lg leading-relaxed">다섯 가지 분류에서 여행의 장면을 찾아보세요.</p><ol className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{CATEGORIES.map((category, index) => <li className="rounded-panel border-border bg-surface border p-6" key={category.code}><p className="text-muted-foreground text-sm">{String(index + 1).padStart(2, "0")} · JOURNAL</p><h2 className="mt-4 font-serif text-2xl">{category.label}</h2><p className="text-muted-foreground mt-3 min-h-14 leading-relaxed">{descriptions[category.code]}</p><Link className="mt-5 inline-flex min-h-12 items-center underline underline-offset-4" href={`/posts?category=${category.code}`}>글 모아 보기 ↗</Link></li>)}</ol></main>;
}
