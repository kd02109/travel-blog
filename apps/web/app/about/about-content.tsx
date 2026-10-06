"use client";

import { useMemo } from "react";
import Link from "next/link";
import type { ActionOutput } from "@repo/contracts";
import { CATEGORIES, SITE_NAME } from "@repo/constants";
import { createBrowserTravelApi } from "@repo/api-client/browser";
import { ApiErrorState } from "@repo/api-client/feedback";
import { useTravelQuery } from "@repo/api-client/hooks";

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

export function AboutContent({
  initialSite,
  initialError,
}: {
  initialSite?: ActionOutput<"site.get">;
  initialError?: string;
}) {
  const api = useMemo(() => createBrowserTravelApi(), []);
  const site = useTravelQuery(
    api,
    "site.get",
    { slug: "parents-travel" },
    { siteId: "lookup", actor: "public" },
    { initialData: initialSite, staleTime: 0 },
  );
  const settings = site.data?.settings as Record<string, unknown> | undefined;
  const title =
    typeof settings?.title === "string" && settings.title
      ? settings.title
      : (site.data?.name ?? SITE_NAME);
  const description =
    typeof settings?.description === "string" && settings.description
      ? settings.description
      : "천천히 머물고, 오래 기억하는 여행";
  const showInitialError =
    Boolean(initialError) && !site.data && !site.isFetching && !site.error;

  return (
    <main className="mx-auto w-full max-w-[var(--content-max)] px-5 py-12 md:px-8 md:py-16 xl:px-16">
      <p className="text-muted-foreground text-sm tracking-widest">OUR STORY</p>
      <h1 className="mt-3 font-serif text-3xl leading-[1.35] sm:text-4xl">
        우리의 기록
      </h1>

      {(site.error || showInitialError) && (
        <div className="mt-8 max-w-[var(--article-max)]">
          <ApiErrorState
            error={site.error ?? initialError}
            title={
              site.data
                ? "우리의 기록을 새로 확인하지 못했어요"
                : "사이트 정보를 불러오지 못했어요"
            }
            description={site.error ? undefined : initialError}
            onRetry={() => void site.refetch()}
            isRetrying={site.isFetching}
          />
        </div>
      )}

      <section className="rounded-panel border-border bg-surface mt-8 grid w-full gap-6 border p-6 sm:p-8 lg:grid-cols-[minmax(0,0.36fr)_minmax(0,0.64fr)] lg:gap-12">
        <div>
          <h2 className="font-serif text-2xl">{title}</h2>
          <p className="text-muted-foreground mt-2 text-sm">{description}</p>
        </div>
        <p className="text-base leading-[1.9] sm:text-lg">
          여행을 다녀온 날짜와 지역, 길에서 만난 풍경과 쉬어 간 순간을 적습니다.
          하룻밤 더 머문 여행은 그 시간의 흐름대로 씁니다. 여행길에서 맛본
          음식과 커피, 머문 숙소의 이야기는 다시 떠올릴 수 있도록 따로 남깁니다.
          다음 여행을 준비할 때 펼쳐 볼 일정표도 함께 모읍니다.
        </p>
      </section>

      <section
        aria-labelledby="record-types-heading"
        className="mt-14 md:mt-16"
      >
        <p className="text-muted-foreground text-sm tracking-widest">
          WHAT WE KEEP
        </p>
        <h2
          id="record-types-heading"
          className="mt-2 font-serif text-2xl sm:text-3xl"
        >
          여행에서 남기는 것
        </h2>
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {CATEGORIES.map((category) => (
            <article
              key={category.code}
              className="rounded-panel border-border bg-surface border p-6"
            >
              <h3 className="font-serif text-xl">{category.label}</h3>
              <p className="text-muted-foreground mt-3 min-h-20 text-sm leading-7">
                {recordDescriptions[category.code]}
              </p>
              <Link
                href={{
                  pathname: "/posts",
                  query: { category: category.code },
                }}
                className="text-foreground focus-visible:outline-ring mt-4 inline-flex min-h-11 items-center text-sm font-semibold underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2"
              >
                {category.label} 보기
              </Link>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
