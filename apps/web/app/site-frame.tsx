"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { CATEGORIES, SITE_NAME } from "@repo/constants";

export function SiteFrame({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [activeCategory, setActiveCategory] = useState<string>();
  const [menuOpen, setMenuOpen] = useState(false);
  useEffect(() => {
    const syncCategory = () => {
      const requested = new URLSearchParams(window.location.search).get(
        "category",
      );
      setActiveCategory(
        CATEGORIES.find((category) => category.code === requested)?.code,
      );
    };
    syncCategory();
    window.addEventListener("popstate", syncCategory);
    window.addEventListener("travel-category-change", syncCategory);
    return () => {
      window.removeEventListener("popstate", syncCategory);
      window.removeEventListener("travel-category-change", syncCategory);
    };
  }, [pathname]);
  return (
    <div className="flex min-h-screen flex-col">
      <a
        href="#main-content"
        className="bg-surface sr-only z-50 rounded p-3 focus:not-sr-only focus:fixed focus:top-4 focus:left-4"
      >
        본문으로 건너뛰기
      </a>
      <header className="border-border bg-background border-b">
        <div className="mx-auto flex min-h-[88px] max-w-[var(--content-max)] items-center justify-between gap-6 px-5 md:px-8 xl:px-16">
          <Link
            href="/"
            className="font-serif text-xl leading-tight sm:text-2xl"
          >
            {SITE_NAME}
          </Link>
          <nav
            aria-label="주요 메뉴"
            className="hidden items-center gap-2 lg:flex"
          >
            {CATEGORIES.map((category) => {
              return (
                <Link
                  key={category.code}
                  href={`/posts?category=${category.code}`}
                  aria-current={
                    pathname === "/posts" && activeCategory === category.code
                      ? "page"
                      : undefined
                  }
                  className="rounded-control text-foreground hover:bg-muted inline-flex min-h-12 items-center px-3 text-base focus-visible:relative"
                  onClick={() => setActiveCategory(category.code)}
                >
                  {category.label}
                </Link>
              );
            })}
            <Link
              href="/about"
              className="rounded-control text-foreground hover:bg-muted inline-flex min-h-12 items-center px-3 text-base"
            >
              우리의 기록
            </Link>
            <Link
              href="/contents"
              className="rounded-control text-foreground hover:bg-muted inline-flex min-h-12 items-center px-3 text-base"
            >
              목차
            </Link>
          </nav>
          <button
            type="button"
            className="rounded-control hover:bg-muted inline-flex size-12 items-center justify-center lg:hidden"
            aria-label={menuOpen ? "메뉴 닫기" : "메뉴 열기"}
            aria-expanded={menuOpen}
            aria-controls="mobile-category-menu"
            onClick={() => setMenuOpen((open) => !open)}
          >
            <span>{menuOpen ? "닫기" : "메뉴"}</span>
          </button>
          <Link
            href="/login"
            className="rounded-control hover:bg-muted hidden min-h-12 items-center px-3 text-base sm:inline-flex"
          >
            로그인
          </Link>
          <Link
            href="/account"
            className="rounded-control hover:bg-muted inline-flex min-h-12 items-center px-3 text-base"
          >
            내 계정
          </Link>
        </div>
        {menuOpen && (
          <nav
            id="mobile-category-menu"
            aria-label="여행 분류"
            className="border-border bg-surface border-t px-5 py-3 lg:hidden"
          >
            <ul className="mx-auto grid max-w-[var(--content-max)] gap-1 sm:grid-cols-2">
              {CATEGORIES.map((category) => (
                <li key={category.code}>
                  <Link
                    href={`/posts?category=${category.code}`}
                    aria-current={
                      pathname === "/posts" && activeCategory === category.code
                        ? "page"
                        : undefined
                    }
                    onClick={() => {
                      setActiveCategory(category.code);
                      setMenuOpen(false);
                    }}
                    className="rounded-control hover:bg-muted flex min-h-12 items-center px-4"
                  >
                    {category.label}
                  </Link>
                </li>
              ))}
              <li>
                <Link
                  href="/about"
                  onClick={() => setMenuOpen(false)}
                  className="rounded-control hover:bg-muted flex min-h-12 items-center px-4"
                >
                  우리의 기록
                </Link>
              </li>
              <li>
                <Link
                  href="/contents"
                  onClick={() => setMenuOpen(false)}
                  className="rounded-control hover:bg-muted flex min-h-12 items-center px-4"
                >
                  목차
                </Link>
              </li>
              <li>
                <Link
                  href="/account"
                  onClick={() => setMenuOpen(false)}
                  className="rounded-control hover:bg-muted flex min-h-12 items-center px-4"
                >
                  내 계정
                </Link>
              </li>
            </ul>
          </nav>
        )}
      </header>
      <div id="main-content" className="flex flex-1 flex-col">
        {children}
      </div>
      <footer className="border-border bg-surface mt-16 border-t">
        <div className="text-muted-foreground mx-auto grid w-full max-w-[var(--content-max)] gap-4 px-5 py-8 text-sm md:grid-cols-[1fr_auto] md:items-center md:px-8 xl:px-16">
          <p>{SITE_NAME} · 세상을 여행하고 삶을 기록합니다.</p>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
            <Link
              href="/posts"
              className="inline-flex min-h-12 items-center underline-offset-4 hover:underline"
            >
              여행 기록
            </Link>
            <Link
              href="/login"
              className="inline-flex min-h-12 items-center underline-offset-4 hover:underline"
            >
              관리자 로그인
            </Link>
            <Link
              href="/about"
              className="inline-flex min-h-12 items-center underline-offset-4 hover:underline"
            >
              우리의 기록
            </Link>
            <Link
              href="/contents"
              className="inline-flex min-h-12 items-center underline-offset-4 hover:underline"
            >
              목차
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
