import type { ReactNode } from "react";
import styles from "./catalog.module.css";

function EmptyJourneyIllustration() {
  return (
    <svg
      aria-hidden="true"
      className="h-auto w-full max-w-[380px]"
      viewBox="0 0 400 280"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <circle cx="203" cy="139" r="113" fill="var(--muted)" opacity="0.65" />
      <path
        d="M64 65 145 53l83 13 100-14v169l-100 15-83-14-81 13V65Z"
        fill="var(--surface)"
        stroke="var(--border)"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path d="m65 66 80-12v168l-80 12V66Z" fill="#EFF2EA" />
      <path d="m145 54 83 13v169l-83-14V54Z" fill="#E4EBE3" />
      <path d="m228 67 99-14v168l-99 15V67Z" fill="#F2F3EC" />
      <path
        d="M145 54v168m83-155v169"
        stroke="var(--border)"
        strokeWidth="1.5"
      />
      <path
        d="M65 147c29-21 51-28 80-28 30 0 56 22 83 18 35-6 61-30 99-25M65 169c29-21 51-28 80-28 30 0 56 22 83 18 35-6 61-30 99-25M65 91c33 14 51 17 80 8 30-9 52-6 83 5 29 11 62 6 99-8"
        stroke="#BACBC0"
        strokeWidth="1.5"
        opacity="0.75"
      />
      <path
        d="M96 191c20-7 28-28 50-27 24 1 29 37 57 32 28-5 18-54 48-52 25 1 30-34 39-49"
        stroke="#48736C"
        strokeWidth="3.5"
        strokeLinecap="round"
        strokeDasharray="1 10"
      />
      <circle
        cx="96"
        cy="191"
        r="8"
        fill="var(--surface)"
        stroke="#48736C"
        strokeWidth="3"
      />
      <path
        d="M290 55c-13 0-23 10-23 23 0 17 23 40 23 40s23-23 23-40c0-13-10-23-23-23Z"
        fill="var(--primary)"
      />
      <circle cx="290" cy="78" r="7" fill="var(--surface)" />
      <path
        d="m58 40 3-9 3 9 9 3-9 3-3 9-3-9-9-3 9-3ZM349 161l2-6 2 6 6 2-6 2-2 6-2-6-6-2 6-2Z"
        fill="#BB9A63"
      />
      <rect
        x="42"
        y="208"
        width="141"
        height="49"
        rx="5"
        fill="var(--surface)"
        stroke="var(--border)"
        strokeWidth="1.5"
      />
      <path d="M56 225h49" stroke="var(--primary)" strokeWidth="2" />
      <path d="M56 238h88" stroke="var(--border)" strokeWidth="2" />
      <path d="M56 246h66" stroke="var(--border)" strokeWidth="2" />
      <circle cx="163" cy="232" r="8" fill="var(--accent)" />
      <path
        d="m159 232 3 3 5-6"
        stroke="var(--primary)"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function CatalogEmpty({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action: ReactNode;
}) {
  return (
    <section
      aria-labelledby="catalog-empty-title"
      className={styles.emptyState}
    >
      <div className={styles.emptyLayout}>
        <div className={styles.emptyCopy}>
          <p className={styles.eyebrow}>THE NEXT JOURNEY</p>
          <h2 id="catalog-empty-title" className={styles.emptyTitle}>
            {title}
          </h2>
          <p className={styles.emptyDescription}>{description}</p>
          <div className={styles.emptyAction}>{action}</div>
        </div>
        <div className={styles.emptyArtwork}>
          <EmptyJourneyIllustration />
        </div>
      </div>
    </section>
  );
}
