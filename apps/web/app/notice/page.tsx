import type { Metadata } from "next";
import Link from "next/link";
import { SITE_NAME } from "@repo/constants";

export const metadata: Metadata = {
  title: `저작권 및 이용 안내 | ${SITE_NAME}`,
  description: `${SITE_NAME}의 콘텐츠와 댓글 이용 안내`,
  alternates: { canonical: "/notice" },
};

export default function NoticePage() {
  return (
    <main className="mx-auto w-full max-w-3xl px-5 py-12 md:px-8 md:py-16">
      <p className="text-muted-foreground text-sm tracking-widest">
        SITE NOTICE
      </p>
      <h1 className="mt-3 font-serif text-3xl sm:text-4xl">
        저작권 및 이용 안내
      </h1>
      <p className="text-muted-foreground mt-4 leading-relaxed">
        {SITE_NAME}의 여행 이야기를 편안하게 읽고 나누기 위한 안내입니다.
      </p>
      <div className="mt-10 space-y-8 leading-relaxed">
        <section className="border-border border-t pt-6">
          <h2 className="font-serif text-xl">글과 사진</h2>
          <p className="text-muted-foreground mt-3">
            이곳에 실린 글과 사진의 권리는 각 작성자 또는 표시된 권리자에게
            있습니다. 게시글 링크는 공유할 수 있습니다. 글이나 사진을 복제하거나
            다른 곳에 다시 게시할 때에는 권리자의 허락을 받아 주세요.
          </p>
        </section>
        <section className="border-border border-t pt-6">
          <h2 className="font-serif text-xl">여행 정보</h2>
          <p className="text-muted-foreground mt-3">
            일정, 가격, 운영 시간 등은 글이 작성된 시점 이후 달라질 수 있습니다.
            방문 전 해당 장소의 공식 안내를 확인해 주세요.
          </p>
        </section>
        <section className="border-border border-t pt-6">
          <h2 className="font-serif text-xl">댓글과 외부 링크</h2>
          <p className="text-muted-foreground mt-3">
            댓글은 다른 독자에게 공개됩니다. 본인이나 타인의 개인정보는 적지
            말아 주세요. 외부 사이트로 이어지는 링크의 내용과 이용 조건은 해당
            사이트에서 확인해 주세요.
          </p>
        </section>
      </div>
      <Link
        href="/posts"
        className="mt-10 inline-flex min-h-12 items-center underline underline-offset-4"
      >
        여행 기록으로 돌아가기
      </Link>
    </main>
  );
}
