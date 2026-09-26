import { SITE_NAME } from "@repo/constants";

export default function About() {
  return (
    <main className="mx-auto w-full max-w-[var(--content-max)] px-5 py-12 md:px-8 md:py-16 xl:px-16">
      <p className="text-muted-foreground text-sm tracking-widest">OUR STORY</p>
      <h1 className="mt-3 font-serif text-3xl leading-[1.35] sm:text-4xl">
        우리의 기록
      </h1>
      <section className="rounded-panel border-border bg-surface mt-8 max-w-[var(--article-max)] border p-6 sm:p-8">
        <h2 className="font-serif text-2xl">{SITE_NAME}</h2>
        <p className="mt-4 text-lg leading-[1.8]">
          풍경을 보고, 음식을 맛보고, 골목을 걸으며 여행을 통해 우리의 삶을
          기록합니다.
        </p>
        <p className="text-muted-foreground mt-5 text-base">
          부모님의 소개와 여행을 시작한 이야기를 이곳에 차곡차곡 담을
          예정입니다.
        </p>
      </section>
    </main>
  );
}
