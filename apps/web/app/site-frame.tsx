"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import {
  motion,
  useMotionValueEvent,
  useReducedMotion,
  useScroll,
} from "motion/react";
import { SITE_NAME } from "@repo/constants";
import { authMessages } from "@repo/database/auth-flow";
import { createBrowserDatabase } from "@repo/database/browser";
import { LoginForm } from "./login/login-form";

function LoginUrlObserver({
  pathname,
  onChange,
}: {
  pathname: string;
  onChange: (params: Pick<URLSearchParams, "get" | "has">) => void;
}) {
  const params = useSearchParams();
  useEffect(() => onChange(params), [pathname, params, onChange]);
  return null;
}

function hasPassedHomeHero() {
  const journal = document.getElementById("home-journal");
  return journal
    ? journal.getBoundingClientRect().top <=
        Math.min(96, window.innerHeight * 0.12)
    : window.scrollY >= window.innerHeight;
}

export function SiteFrame({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isHome = pathname === "/";
  const { scrollY } = useScroll();
  const reduceMotion = useReducedMotion();
  const [pastHero, setPastHero] = useState(false);
  const [headerFocused, setHeaderFocused] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [loginOpen, setLoginOpen] = useState(false);
  const [loginNext, setLoginNext] = useState<string>();
  const [loginMessage, setLoginMessage] = useState<{
    text: string;
    error: boolean;
  }>();
  const dialogRef = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const update = () => setPastHero(hasPassedHomeHero());
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, [pathname]);

  useMotionValueEvent(scrollY, "change", () => {
    setPastHero(hasPassedHomeHero());
  });

  useEffect(() => {
    let mounted = true;
    try {
      const auth = createBrowserDatabase().auth;
      void auth
        .getSession()
        .then(({ data }) => {
          if (mounted) setSignedIn(Boolean(data.session));
        })
        .catch(() => {
          if (mounted) setSignedIn(false);
        });
      const { data: listener } = auth.onAuthStateChange((_event, session) => {
        if (mounted) setSignedIn(Boolean(session));
      });
      return () => {
        mounted = false;
        listener.subscription.unsubscribe();
      };
    } catch {
      queueMicrotask(() => {
        if (mounted) setSignedIn(false);
      });
      return () => {
        mounted = false;
      };
    }
  }, []);

  const syncLoginUrl = useCallback(
    (params: Pick<URLSearchParams, "get" | "has">) => {
      if (params.get("login") !== "1") return;
      if (params.get("status") === "signed_out" && !params.has("error")) {
        setLoginOpen(false);
        setLoginMessage(undefined);
        const url = new URL(window.location.href);
        for (const key of ["login", "error", "status", "next"])
          url.searchParams.delete(key);
        window.history.replaceState(
          window.history.state,
          "",
          `${url.pathname}${url.search}${url.hash}`,
        );
        return;
      }
      const key = params.get("error") ?? params.get("status");
      setLoginNext(params.get("next") ?? undefined);
      setLoginMessage(
        key
          ? {
              text: Object.hasOwn(authMessages, key)
                ? (authMessages[key] ?? authMessages.oauth)
                : authMessages.oauth,
              error: params.has("error"),
            }
          : undefined,
      );
      setLoginOpen(true);
    },
    [],
  );

  useEffect(() => {
    const openLogin = (event: Event) => {
      const detail = (event as CustomEvent<{ next?: string }>).detail;
      setLoginNext(
        detail?.next ??
          `${window.location.pathname}${window.location.search}${window.location.hash}`,
      );
      setLoginMessage(undefined);
      setLoginOpen(true);
      setMenuOpen(false);
    };
    window.addEventListener("travel-open-login", openLogin);
    return () => window.removeEventListener("travel-open-login", openLogin);
  }, []);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (loginOpen && !dialog.open) dialog.showModal();
    if (!loginOpen && dialog.open) dialog.close();
  }, [loginOpen]);

  function openLogin() {
    setLoginNext(
      `${window.location.pathname}${window.location.search}${window.location.hash}`,
    );
    setLoginMessage(undefined);
    setLoginOpen(true);
    setMenuOpen(false);
  }

  function closeLogin() {
    setLoginOpen(false);
    const url = new URL(window.location.href);
    if (!url.searchParams.has("login")) return;
    for (const key of ["login", "error", "status", "next"])
      url.searchParams.delete(key);
    window.history.replaceState(
      window.history.state,
      "",
      `${url.pathname}${url.search}${url.hash}`,
    );
  }

  const onPosts = pathname.startsWith("/posts");
  const onAbout = pathname === "/about";
  const showHomeHeader = pastHero || headerFocused || menuOpen;
  return (
    <div className="flex min-h-screen flex-col">
      <Suspense fallback={null}>
        <LoginUrlObserver pathname={pathname} onChange={syncLoginUrl} />
      </Suspense>
      <a
        href="#main-content"
        className="bg-surface sr-only z-50 rounded p-3 focus:not-sr-only focus:fixed focus:top-4 focus:left-4"
      >
        본문으로 건너뛰기
      </a>
      <noscript>
        <style>{`header[data-home-header="true"] { opacity: 1 !important; transform: none !important; pointer-events: auto !important; position: relative !important; }`}</style>
      </noscript>
      <motion.header
        data-home-header={isHome ? "true" : undefined}
        data-home-header-visible={isHome && showHomeHeader ? "true" : undefined}
        onFocusCapture={() => setHeaderFocused(true)}
        onBlurCapture={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node))
            setHeaderFocused(false);
        }}
        initial={false}
        animate={
          isHome && !showHomeHeader
            ? { opacity: 0, y: reduceMotion ? 0 : -20 }
            : { opacity: 1, y: 0 }
        }
        transition={{
          duration: reduceMotion ? 0 : 0.48,
          ease: [0.22, 1, 0.36, 1],
        }}
        className={`border-border bg-background border-b ${isHome ? "fixed inset-x-0 top-0 z-40 shadow-[0_8px_28px_rgb(23_60_66_/_8%)]" : "relative"}`}
      >
        <div className="mx-auto flex min-h-[72px] max-w-[var(--content-max)] items-center justify-between gap-3 px-5 md:min-h-[76px] md:px-8 xl:px-16">
          <Link
            href="/"
            className="focus-visible:outline-ring shrink-0 font-serif text-lg leading-tight focus-visible:outline-2 focus-visible:outline-offset-4 sm:text-[1.35rem]"
          >
            {SITE_NAME}
          </Link>
          <nav
            aria-label="주요 메뉴"
            className="hidden items-center gap-5 lg:flex"
          >
            <Link
              href="/posts"
              aria-current={onPosts ? "page" : undefined}
              className={`rounded-control text-foreground hover:bg-muted focus-visible:outline-ring inline-flex min-h-12 items-center px-2 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 ${onPosts ? "font-semibold" : ""}`}
            >
              여행 기록
            </Link>
            <Link
              href="/about"
              aria-current={onAbout ? "page" : undefined}
              className={`rounded-control text-foreground hover:bg-muted focus-visible:outline-ring inline-flex min-h-12 items-center px-2 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 ${onAbout ? "font-semibold" : ""}`}
            >
              우리의 기록
            </Link>
          </nav>
          <div className="flex shrink-0 items-center gap-1 sm:gap-2">
            {signedIn ? (
              <>
                <span
                  role="status"
                  className="text-muted-foreground hidden items-center gap-2 text-sm sm:inline-flex"
                >
                  <span
                    aria-hidden="true"
                    className="size-2 rounded-full bg-[#285447]"
                  />
                  로그인됨
                </span>
                <Link
                  href="/account"
                  aria-label="로그인됨, 내 계정"
                  className="rounded-control hover:bg-muted inline-flex min-h-12 items-center gap-1 px-2 text-sm sm:px-3 sm:text-base"
                >
                  <span
                    aria-hidden="true"
                    className="size-2 rounded-full bg-[#285447] sm:hidden"
                  />
                  내 계정
                </Link>
              </>
            ) : signedIn === false ? (
              <button
                type="button"
                onClick={openLogin}
                className="rounded-control hover:bg-muted inline-flex min-h-12 items-center px-2 text-sm sm:px-3 sm:text-base"
              >
                로그인
              </button>
            ) : (
              <span
                role="status"
                aria-label="계정 확인 중"
                className="inline-flex min-h-12 w-[92px] items-center px-2"
              >
                <span
                  aria-hidden="true"
                  className="bg-muted h-4 w-full animate-pulse motion-reduce:animate-none"
                />
              </span>
            )}
            <button
              type="button"
              className="rounded-control hover:bg-muted inline-flex min-h-12 items-center justify-center px-2 lg:hidden"
              aria-label={menuOpen ? "메뉴 닫기" : "메뉴 열기"}
              aria-expanded={menuOpen}
              aria-controls="mobile-category-menu"
              onClick={() => setMenuOpen((open) => !open)}
            >
              {menuOpen ? "닫기" : "메뉴"}
            </button>
          </div>
        </div>
        {menuOpen && (
          <nav
            id="mobile-category-menu"
            aria-label="주요 메뉴"
            className="border-border bg-surface border-t px-5 py-3 lg:hidden"
          >
            <div className="mx-auto max-w-[var(--content-max)]">
              <ul className="grid gap-1 sm:grid-cols-2">
                <li>
                  <Link
                    href="/posts"
                    aria-current={onPosts ? "page" : undefined}
                    onClick={() => setMenuOpen(false)}
                    className={`rounded-control hover:bg-muted flex min-h-12 items-center px-4 ${onPosts ? "font-semibold" : ""}`}
                  >
                    여행 기록
                  </Link>
                </li>
                <li>
                  <Link
                    href="/about"
                    aria-current={onAbout ? "page" : undefined}
                    onClick={() => setMenuOpen(false)}
                    className={`rounded-control hover:bg-muted flex min-h-12 items-center px-4 ${onAbout ? "font-semibold" : ""}`}
                  >
                    우리의 기록
                  </Link>
                </li>
              </ul>
            </div>
          </nav>
        )}
      </motion.header>
      <div id="main-content" className="flex flex-1 flex-col">
        {children}
      </div>
      <footer className="border-border bg-background mt-16 border-t">
        <div className="text-muted-foreground mx-auto grid w-full max-w-[var(--content-max)] gap-2 px-5 py-6 text-xs sm:text-sm md:grid-cols-[1fr_auto] md:items-center md:gap-6 md:px-8 xl:px-16">
          <p>
            © {new Date().getFullYear()} {SITE_NAME} · 세상을 여행하고 삶을
            기록합니다.
          </p>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-1">
            <Link
              href="/posts"
              className="inline-flex min-h-12 items-center underline-offset-4 hover:underline"
            >
              여행 기록
            </Link>
            <Link
              href="/about"
              className="inline-flex min-h-12 items-center underline-offset-4 hover:underline"
            >
              우리의 기록
            </Link>
            <Link
              href="/notice"
              className="inline-flex min-h-12 items-center underline-offset-4 hover:underline"
            >
              저작권 및 이용 안내
            </Link>
          </div>
        </div>
      </footer>
      <dialog
        ref={dialogRef}
        aria-labelledby="login-dialog-title"
        onClose={closeLogin}
        onClick={(event) => {
          if (event.target === event.currentTarget) event.currentTarget.close();
        }}
        className="travel-login-dialog border-border bg-surface text-foreground rounded-panel m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-md overflow-y-auto border p-6 shadow-xl sm:p-8"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-muted-foreground text-sm">{SITE_NAME}</p>
            <h2 id="login-dialog-title" className="mt-1 font-serif text-2xl">
              로그인
            </h2>
          </div>
          <button
            type="button"
            aria-label="로그인 창 닫기"
            onClick={() => dialogRef.current?.close()}
            className="rounded-control hover:bg-muted inline-flex size-10 items-center justify-center text-xl"
          >
            ×
          </button>
        </div>
        <p className="text-muted-foreground mt-4 leading-relaxed">
          카카오 계정으로 로그인하면 내 계정을 확인하고 계정으로 댓글을 남길 수
          있어요.
        </p>
        {loginMessage && (
          <p
            role={loginMessage.error ? "alert" : "status"}
            className="bg-muted rounded-control mt-4 p-3 text-sm"
          >
            {loginMessage.text}
          </p>
        )}
        <div className="mt-7">
          <LoginForm next={loginNext} />
        </div>
      </dialog>
    </div>
  );
}
