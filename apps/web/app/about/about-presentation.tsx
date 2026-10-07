import type { ReactNode } from "react";
import Link from "next/link";
import { CATEGORIES } from "@repo/constants";
import { Skeleton } from "@repo/ui/skeleton";

const recordDescriptions: Record<(typeof CATEGORIES)[number]["code"], string> =
  {
    "day-walk": "다녀온 날짜와 지역, 함께 걸었던 길과 쉬어 간 곳을 남깁니다.",
    "overnight-trip":
      "떠난 날부터 돌아온 날까지, 며칠간 머물며 만난 장면을 이어 씁니다.",
    "food-cafe":
      "여행길에 들른 카페와 식당에서 맛본 한 잔과 한 끼를 기억합니다.",
    "stay-review": "직접 머문 숙소의 공간과 그곳에서 보낸 시간을 돌아봅니다.",
    "itinerary-pdf":
      "여행의 순서를 다시 펼쳐 볼 수 있도록 일정표를 PDF로 모읍니다.",
  };

const recordKickers: Record<(typeof CATEGORIES)[number]["code"], string> = {
  "day-walk": "WALK",
  "overnight-trip": "JOURNEY",
  "food-cafe": "TABLE",
  "stay-review": "STAY",
  "itinerary-pdf": "PLAN",
};

export function AboutHeading() {
  return (
    <>
      <p className="text-muted-foreground text-sm tracking-widest">OUR STORY</p>
      <h1 className="mt-3 font-serif text-3xl leading-[1.35] sm:text-4xl">
        우리의 기록
      </h1>
    </>
  );
}

export function AboutFeature({ children }: { children: ReactNode }) {
  return (
    <section className="border-foreground/70 mt-9 grid w-full gap-6 border-y py-8 sm:py-10 lg:grid-cols-[minmax(0,0.36fr)_minmax(0,0.64fr)] lg:gap-12">
      <div className="min-w-0">{children}</div>
      <p className="max-w-3xl text-base leading-[1.9] sm:text-lg">
        여행을 다녀온 날짜와 지역, 길에서 만난 풍경과 쉬어 간 순간을 적습니다.
        하룻밤 더 머문 여행은 그 시간의 흐름대로 씁니다. 여행길에서 맛본 음식과
        커피, 머문 숙소의 이야기는 다시 떠올릴 수 있도록 따로 남깁니다. 다음
        여행을 준비할 때 펼쳐 볼 일정표도 함께 모읍니다.
      </p>
    </section>
  );
}

export function AboutSiteSkeleton() {
  return (
    <div role="status" aria-label="사이트 소개를 불러오는 중">
      <span className="sr-only">사이트 소개를 불러오는 중입니다.</span>
      <div aria-hidden="true" className="space-y-3">
        <Skeleton className="h-4 w-2/3" />
        <Skeleton className="mt-5 h-8 w-11/12" />
        <Skeleton className="h-8 w-3/4" />
      </div>
    </div>
  );
}

export function AboutRecordTypes() {
  return (
    <section aria-labelledby="record-types-heading" className="mt-16 md:mt-20">
      <p className="text-muted-foreground text-sm tracking-widest">
        WHAT WE KEEP
      </p>
      <h2
        id="record-types-heading"
        className="mt-2 font-serif text-2xl sm:text-3xl"
      >
        여행에서 남기는 것
      </h2>
      <ol className="border-border mt-7 grid border-t sm:grid-cols-2 lg:grid-cols-5">
        {CATEGORIES.map((category, index) => (
          <li
            key={category.code}
            className="border-border border-b py-5 sm:px-5 sm:first:pl-0 sm:nth-[2n]:border-l lg:min-h-72 lg:border-r lg:border-b-0 lg:px-5 lg:last:border-r-0 lg:nth-[2n]:border-l-0"
          >
            <Link
              href={{
                pathname: "/posts",
                query: { category: category.code },
              }}
              className="group focus-visible:outline-ring flex h-full min-h-32 flex-col focus-visible:outline-2 focus-visible:outline-offset-4 lg:min-h-64"
            >
              <span className="text-xs font-semibold tracking-[0.22em] text-[#856a48]">
                {String(index + 1).padStart(2, "0")} /{" "}
                {recordKickers[category.code]}
              </span>
              <h3 className="mt-5 font-serif text-xl leading-snug group-hover:underline group-hover:underline-offset-4">
                {category.label}
              </h3>
              <p className="text-muted-foreground mt-3 text-sm leading-7">
                {recordDescriptions[category.code]}
              </p>
              <span aria-hidden="true" className="mt-auto pt-5 text-xl">
                ↗
              </span>
            </Link>
          </li>
        ))}
      </ol>
    </section>
  );
}
