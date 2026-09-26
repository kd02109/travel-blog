import Link from "next/link";
import { CATEGORIES, SITE_NAME } from "@repo/constants";
import { AnalyticsConsent } from "./analytics-consent";
export default function Home() {
  return (
    <main className="mx-auto w-full max-w-[var(--content-max)] px-5 py-12 md:px-8 md:py-20 xl:px-16">
      <section
        aria-labelledby="postcard-title"
        className="rounded-panel border-border bg-surface relative grid min-h-[min(68vh,640px)] items-end overflow-hidden border p-4 sm:min-h-[540px] sm:p-8 lg:grid-cols-[1.2fr_0.8fr] lg:items-center lg:p-12"
      >
        <div
          aria-label="대표 여행 사진 자리"
          className="rounded-postcard absolute inset-4 bg-[radial-gradient(ellipse_at_70%_25%,rgb(255_255_255_/_90%),transparent_22%),linear-gradient(165deg,#d8e2d8_0%,#b9d1cf_38%,#88a9a2_39%,#d9ded1_70%,#f4eee2_100%)] sm:inset-8"
          role="img"
        >
          <span className="rounded-control bg-surface/90 text-muted-foreground absolute bottom-4 left-4 px-3 py-2 text-sm sm:bottom-6 sm:left-6">
            대표 여행 사진을 준비하고 있어요
          </span>
        </div>
        <div className="rounded-postcard border-border bg-background relative z-10 mb-2 border p-6 shadow-[0_12px_32px_rgb(23_60_66_/_14%)] sm:mb-5 sm:ml-auto sm:max-w-xl sm:p-10 lg:col-start-2 lg:row-start-1 lg:my-10 lg:mr-2 lg:p-12">
          <p className="text-muted-foreground text-sm font-medium tracking-[0.16em]">
            POSTCARD / 오늘의 여행
          </p>
          <h1
            id="postcard-title"
            className="mt-5 font-serif text-[clamp(2rem,5vw,3rem)] leading-[1.35]"
          >
            천천히 머물고,
            <br className="hidden sm:block" /> 오래 기억하는 여행
          </h1>
          <p className="text-muted-foreground mt-5 max-w-md text-base leading-relaxed">
            {SITE_NAME}의 여행책을 한 장씩 펼쳐 보세요.
          </p>
          <Link
            href="/posts"
            className="rounded-control bg-primary text-primary-foreground mt-7 inline-flex min-h-12 items-center justify-center px-6 text-base font-medium transition-colors hover:bg-[var(--primary-hover)]"
          >
            이 여행 펼치기 ↗
          </Link>
        </div>
      </section>
      <section className="mt-12 sm:mt-16" aria-labelledby="category-heading">
        <p className="text-muted-foreground text-sm font-medium tracking-wider">
          OUR TRAVEL JOURNAL
        </p>
        <h2
          id="category-heading"
          className="mt-2 font-serif text-2xl sm:text-3xl"
        >
          함께한 여행의 장면
        </h2>
        <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {CATEGORIES.map((category, index) => (
            <li key={category.code}>
              <Link
                href={`/posts?category=${category.code}`}
                className="group rounded-panel border-border bg-surface hover:border-primary hover:bg-muted/50 flex min-h-36 flex-col justify-between border p-5 transition-colors focus-visible:relative sm:p-6"
              >
                <span className="text-muted-foreground text-sm">
                  0{index + 1} · TRAVEL NOTE
                </span>
                <span className="mt-5 flex items-center justify-between gap-3 font-serif text-xl sm:text-2xl">
                  <span>{category.label}</span>
                  <span
                    aria-hidden="true"
                    className="text-primary transition-transform group-hover:translate-x-1"
                  >
                    ↗
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
      <div className="mt-12">
        <AnalyticsConsent />
      </div>
      <form action="/auth/signout" method="post" className="mt-6">
        <button
          type="submit"
          className="rounded-control text-muted-foreground inline-flex min-h-12 items-center px-3 text-sm underline underline-offset-4"
        >
          현재 계정 로그아웃
        </button>
      </form>
    </main>
  );
}
