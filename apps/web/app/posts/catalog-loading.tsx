import Link from "next/link";
import { CATEGORIES } from "@repo/constants";
import { Skeleton } from "@repo/ui/skeleton";
import { PostCardSkeleton } from "../post-card";
import styles from "./catalog.module.css";

export function CatalogSkeleton() {
  return (
    <section role="status" aria-label="여행 기록 목록을 불러오는 중">
      <span className="sr-only">여행 기록 목록을 불러오는 중입니다.</span>
      <div aria-hidden="true">
        <Skeleton className={styles.listNoteSkeleton} />
        <ul className={styles.postList}>
          {Array.from({ length: 12 }, (_, index) => (
            <PostCardSkeleton key={index} />
          ))}
        </ul>
      </div>
    </section>
  );
}

export function CatalogPageLoading() {
  return (
    <main className="mx-auto w-full max-w-[var(--content-max)] px-5 py-10 md:px-8 md:py-14 xl:px-16">
      <header>
        <p className={styles.eyebrow}>OUR TRAVEL JOURNAL</p>
        <h1 className={styles.pageTitle}>여행 기록</h1>
        <p className={styles.intro}>
          걸었던 길과 머문 장소를 천천히 다시 읽습니다.
        </p>
        <nav aria-label="여행 기록 분류" className={styles.categoryNav}>
          <Link
            href="/posts"
            className={`${styles.categoryButton} ${styles.categoryLoadingLink}`}
          >
            모든 여행
          </Link>
          {CATEGORIES.map((item) => (
            <Link
              key={item.code}
              href={`/posts?category=${item.code}`}
              className={`${styles.categoryButton} ${styles.categoryLoadingLink}`}
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </header>
      <div className={styles.catalogContent}>
        <CatalogSkeleton />
      </div>
    </main>
  );
}
