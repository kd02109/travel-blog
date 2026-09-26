import { CATEGORIES, SITE_NAME } from "@repo/constants";
import { AnalyticsConsent } from "./analytics-consent";
export default function Home() {
  return (
    <main className="mx-auto max-w-5xl px-6 py-20">
      <p className="text-muted-foreground text-sm tracking-widest">
        세상을 여행하고 삶을 기록합니다.
      </p>
      <h1 className="mt-5 text-4xl font-semibold">{SITE_NAME}</h1>
      <p className="mt-6 text-xl">천천히 머물고, 오래 기억하는 여행</p>
      <ul className="mt-12 grid gap-4 sm:grid-cols-2">
        {CATEGORIES.map((category) => (
          <li key={category.code} className="rounded-lg border p-6">
            <h2 className="text-xl font-medium">{category.label}</h2>
            <p className="text-muted-foreground mt-2">
              여행 기록을 준비하고 있어요.
            </p>
          </li>
        ))}
      </ul>
      <footer className="mt-16 border-t pt-6">
        <a href="/login" className="underline">
          로그인
        </a>
        <form action="/auth/signout" method="post" className="my-4">
          <button type="submit" className="underline">
            현재 계정 로그아웃
          </button>
        </form>
        <AnalyticsConsent />
      </footer>
    </main>
  );
}
