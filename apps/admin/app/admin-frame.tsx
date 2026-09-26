"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { SITE_NAME } from "@repo/constants";

const items = [
  { href: "/posts", label: "글 관리" },
  { href: "/comments", label: "댓글 관리" },
  { href: "/write", label: "새 글 작성" },
  { href: "/home-design", label: "홈 디자인" },
  { href: "/playground", label: "에디터 체험", developmentOnly: true },
];

export function AdminFrame({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  if (pathname === "/login") return children;
  const visibleItems = items.filter(
    (item) => !item.developmentOnly || process.env.NODE_ENV === "development",
  );
  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[var(--admin-sidebar)_minmax(0,1fr)]">
      <a
        href="#admin-content"
        className="bg-surface sr-only z-50 rounded p-3 focus:not-sr-only focus:fixed focus:top-4 focus:left-4"
      >
        본문으로 건너뛰기
      </a>
      <aside className="border-border bg-surface border-b lg:min-h-screen lg:border-r lg:border-b-0">
        <div className="flex min-h-20 items-center px-5 lg:px-6">
          <Link href="/" className="font-serif text-xl">
            {SITE_NAME}
          </Link>
          <span className="rounded-control bg-muted ml-2 px-2 py-1 text-xs">
            관리
          </span>
        </div>
        <nav
          aria-label="관리자 메뉴"
          className="px-3 pb-3 lg:sticky lg:top-0 lg:px-4 lg:py-4"
        >
          <ul className="flex gap-2 overflow-x-auto lg:flex-col">
            {visibleItems.map(({ href, label }) => {
              const active =
                label === "새 글 작성"
                  ? pathname === href
                  : label === "홈 디자인"
                    ? pathname === href
                    : label === "에디터 체험"
                      ? pathname === href
                      : label === "댓글 관리"
                        ? pathname.startsWith("/comments")
                        : pathname === "/" || pathname.startsWith("/posts");
              return (
                <li key={label} className="shrink-0">
                  <Link
                    href={href}
                    aria-current={active ? "page" : undefined}
                    className={`rounded-control hover:bg-muted flex min-h-12 items-center gap-3 px-4 text-base ${active ? "bg-muted text-primary font-semibold" : "text-muted-foreground"}`}
                  >
                    <span>{label}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      </aside>
      <div id="admin-content" className="min-w-0">
        {children}
      </div>
    </div>
  );
}
