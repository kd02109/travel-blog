import { Skeleton } from "@repo/ui/skeleton";
import styles from "./home-content.module.css";

export function HomeHeroSkeleton() {
  return (
    <div
      className={styles.heroSkeleton}
      role="status"
      aria-label="홈 표지를 불러오는 중"
    >
      <span className="sr-only">홈 표지를 불러오는 중입니다.</span>
      <div className={styles.heroSkeletonImage} aria-hidden="true" />
      <div className={styles.heroSkeletonCopy} aria-hidden="true">
        <Skeleton className="h-3 w-2/5" />
        <Skeleton className="mt-6 h-10 w-11/12" />
        <Skeleton className="mt-3 h-10 w-4/5" />
        <Skeleton className="mt-6 h-4 w-3/4" />
        <Skeleton className="rounded-control mt-7 h-12 w-44" />
      </div>
    </div>
  );
}

export function HomePageLoading() {
  return (
    <main className={styles.homeMain}>
      <div className={styles.heroScreen}>
        <HomeHeroSkeleton />
      </div>
    </main>
  );
}
