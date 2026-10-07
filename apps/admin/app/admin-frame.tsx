"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { SITE_NAME } from "@repo/constants";
import { createBrowserDatabase } from "@repo/database/browser";

const items = [
  { href: "/posts", label: "글 관리" },
  { href: "/comments", label: "댓글 관리" },
  { href: "/account-deletions", label: "계정 삭제 요청" },
  { href: "/write", label: "새 글 작성" },
  { href: "/home-design", label: "홈 디자인" },
];

type Account = { name: string; email: string | null };

function accountName(metadata: Record<string, unknown>) {
  for (const key of ["full_name", "name", "nickname"]) {
    const value = metadata[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "관리자 계정";
}

function AdminAccount({ onMissingSession }: { onMissingSession: () => void }) {
  const [account, setAccount] = useState<Account | null>(null);
  const [loading, setLoading] = useState(true);
  const signingOut = useRef(false);
  const verifiedAccount = useRef(false);

  useEffect(() => {
    let active = true;
    let subscription: { unsubscribe: () => void } | undefined;

    async function initialize() {
      try {
        const db = createBrowserDatabase();
        subscription = db.auth.onAuthStateChange((event) => {
          if (event === "SIGNED_OUT") {
            setAccount(null);
            if (verifiedAccount.current && !signingOut.current)
              window.location.replace("/login?error=expired");
          }
        }).data.subscription;
        const { data, error } = await db.auth.getUser();
        if (!active) return;
        verifiedAccount.current = !error && !!data.user;
        if (
          !data.user &&
          (!error ||
            error.name === "AuthSessionMissingError" ||
            error.status === 401 ||
            error.status === 403)
        ) {
          setAccount(null);
          if (!signingOut.current) onMissingSession();
          return;
        }
        setAccount(
          error || !data.user
            ? null
            : {
                name: accountName(data.user.user_metadata),
                email: data.user.email ?? null,
              },
        );
      } catch {
        if (active) setAccount(null);
      } finally {
        if (active) setLoading(false);
      }
    }

    void initialize();
    return () => {
      active = false;
      subscription?.unsubscribe();
    };
  }, [onMissingSession]);

  return (
    <section
      aria-label="현재 로그인 계정"
      className="border-border border-t p-4"
    >
      <p className="text-muted-foreground text-xs">현재 로그인 계정</p>
      {account ? (
        <div className="mt-1 min-w-0">
          <p className="truncate font-semibold" title={account.name}>
            {account.name}
          </p>
          <p
            className="text-muted-foreground truncate text-sm"
            title={account.email ?? undefined}
          >
            {account.email ?? "카카오 계정"}
          </p>
        </div>
      ) : (
        <p role="status" className="text-muted-foreground mt-1 text-sm">
          {loading ? "계정 정보 확인 중…" : "계정 정보를 확인할 수 없습니다."}
        </p>
      )}
      <form
        action="/auth/signout"
        method="post"
        className="mt-3"
        onSubmit={() => {
          signingOut.current = true;
        }}
      >
        <button
          type="submit"
          className="rounded-control border-border hover:bg-muted focus-visible:outline-ring min-h-12 w-full border px-4 text-left text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          로그아웃
        </button>
      </form>
    </section>
  );
}

export function AdminFrame({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  if (pathname === "/login" || pathname === "/forbidden") return children;
  return (
    <AdminShell key={pathname} pathname={pathname}>
      {children}
    </AdminShell>
  );
}

function AdminShell({
  children,
  pathname,
}: {
  children: React.ReactNode;
  pathname: string;
}) {
  const router = useRouter();
  const [checkingAccess, setCheckingAccess] = useState(false);
  const refreshRequested = useRef(false);
  const recheckServer = useCallback(() => {
    if (refreshRequested.current) return;
    refreshRequested.current = true;
    setCheckingAccess(true);
    router.refresh();
  }, [router]);
  const isMockDemo = pathname === "/mock";
  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[var(--admin-sidebar)_minmax(0,1fr)]">
      <a
        href="#admin-content"
        className="bg-surface sr-only z-50 rounded p-3 focus:not-sr-only focus:fixed focus:top-4 focus:left-4"
      >
        본문으로 건너뛰기
      </a>
      <aside className="border-border bg-surface border-b lg:sticky lg:top-0 lg:flex lg:h-screen lg:flex-col lg:self-start lg:overflow-y-auto lg:border-r lg:border-b-0">
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
          className="px-3 pb-3 lg:flex-1 lg:px-4 lg:py-4"
        >
          <ul className="flex gap-2 overflow-x-auto lg:flex-col">
            {items.map(({ href, label }) => {
              const active =
                label === "새 글 작성"
                  ? pathname === href
                  : label === "홈 디자인"
                    ? pathname === href
                    : label === "댓글 관리"
                      ? pathname.startsWith("/comments")
                      : label === "계정 삭제 요청"
                        ? pathname.startsWith("/account-deletions")
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
        {!isMockDemo && <AdminAccount onMissingSession={recheckServer} />}
      </aside>
      <div id="admin-content" className="min-w-0">
        {checkingAccess ? (
          <main role="status" className="p-6">
            로그인 상태를 다시 확인하는 중…
          </main>
        ) : (
          children
        )}
      </div>
    </div>
  );
}
