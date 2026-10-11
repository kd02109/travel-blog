import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { TravelApiError } from "@repo/api-client";
import { requireEditor } from "../../lib/auth";
import { ErrorHealth } from "./error-health";
import { ErrorOverview } from "./error-overview";
import { ErrorLookupGuide } from "./lookup-guide";
import {
  errorListLocation,
  parseErrorListQuery,
  errorStatusLabels,
} from "../../lib/error-analytics";
import styles from "./error-analytics-preview.module.css";

export const metadata: Metadata = {
  title: "웹 오류 분석 | 관리자",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";
const size = 20;
export default async function ErrorAnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { membership, site, api } = await requireEditor();
  if (membership.role !== "owner" && membership.role !== "admin")
    redirect("/forbidden");
  const query = parseErrorListQuery(await searchParams);
  let result: Awaited<ReturnType<typeof api.listAdminErrorPage>> | null = null;
  if (query.valid) {
    try {
      result = await api.listAdminErrorPage({
        site_id: site.id,
        limit: size,
        offset: (query.page - 1) * size,
        status: query.status,
        search: query.search,
        app: query.app,
        environment: query.environment,
        period: query.period,
      });
    } catch (error) {
      if (error instanceof TravelApiError) {
        if (error.status === 401) redirect("/login?error=expired");
        if (error.status === 403) redirect("/forbidden");
      }
    }
  }
  let summary: Awaited<ReturnType<typeof api.getAdminErrorSummary>> | null =
    null;
  try {
    summary = query.valid
      ? await api.getAdminErrorSummary({
          site_id: site.id,
          app: query.app,
          environment: query.environment,
          period: query.period,
          status: query.status,
          search: query.search,
        })
      : null;
  } catch (error) {
    if (error instanceof TravelApiError) {
      if (error.status === 401) redirect("/login?error=expired");
      if (error.status === 403) redirect("/forbidden");
    }
  }
  let health: Awaited<ReturnType<typeof api.getAdminErrorHealth>> | null = null;
  try {
    health = await api.getAdminErrorHealth({
      site_id: site.id,
      app: query.app,
      environment: query.environment,
    });
  } catch (error) {
    if (error instanceof TravelApiError) {
      if (error.status === 401) redirect("/login?error=expired");
      if (error.status === 403) redirect("/forbidden");
    }
  }
  const pages = Math.max(1, Math.ceil((result?.total ?? 0) / size));
  if (result && query.page > pages)
    redirect(errorListLocation({ ...query, page: pages }));
  return (
    <main className={styles.page}>
      <div className={styles.content}>
        <header className={styles.header}>
          <div>
            <p className={styles.eyebrow}>운영 상태 / 블로그와 관리자</p>
            <h1>웹 오류 분석</h1>
            <p className={styles.intro}>
              실제 수집된 오류를 확인하고 처리합니다. 이메일의 이슈 ID로 바로
              찾을 수 있습니다.
            </p>
          </div>
        </header>
        <section
          className={`${styles.issuesPanel} ${styles.overview}`}
          aria-label="오류 조회 조건"
        >
          <form
            key={`${query.status}:${query.search}:${query.app}:${query.environment}:${query.period}`}
            className={styles.filters}
            action="/error-analytics-preview"
            method="get"
          >
            <label>
              환경
              <select name="environment" defaultValue={query.environment}>
                <option value="production">운영</option>
                <option value="preview">Preview</option>
                <option value="development">개발</option>
                <option value="all">전체 환경</option>
              </select>
            </label>
            <label>
              앱
              <select name="app" defaultValue={query.app}>
                <option value="all">모든 앱</option>
                <option value="web">블로그</option>
                <option value="admin">관리자</option>
              </select>
            </label>
            <label>
              기간
              <select name="period" defaultValue={query.period}>
                <option value="24h">최근 24시간</option>
                <option value="7d">최근 7일</option>
                <option value="14d">최근 14일</option>
                <option value="all">보관 이슈 전체 누적</option>
              </select>
            </label>
            <label>
              상태
              <select name="status" defaultValue={query.status}>
                <option value="all">전체</option>
                {Object.entries(errorStatusLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className={styles.search}>
              이슈 ID · 수집/원래 요청 ID · fingerprint
              <input
                name="search"
                defaultValue={query.search}
                placeholder="전체 ID를 붙여 넣으세요"
                maxLength={100}
              />
            </label>
            <button type="submit">검색</button>
            <Link href="/error-analytics-preview">초기화</Link>
          </form>
        </section>
        <ErrorHealth health={health} />
        <ErrorOverview
          summary={summary}
          period={query.period}
          environment={query.environment}
          app={query.app}
        />
        <section className={styles.issuesPanel} aria-labelledby="issues-title">
          <div className={styles.panelHeading}>
            <div>
              <p className={styles.panelKicker}>저장된 오류 목록</p>
              <h2 id="issues-title">지금 확인할 오류</h2>
            </div>
            {result && (
              <span>
                전체 {result.total.toLocaleString("ko-KR")}개 · 최근 발생 순
              </span>
            )}
          </div>

          {!query.valid ? (
            <p role="alert">
              UUID 형식의 전체 이슈·요청 ID 또는 64자리 fingerprint를 입력해
              주세요.
            </p>
          ) : !result ? (
            <p role="alert">
              오류 기록을 조회하지 못했습니다.{" "}
              <a href={errorListLocation(query)}>다시 시도</a>
            </p>
          ) : result.items.length === 0 ? (
            <p className={styles.empty}>조건에 맞는 오류가 없습니다.</p>
          ) : (
            <div className={styles.tableScroll}>
              <table className={styles.table}>
                <caption className={styles.srOnly}>
                  실제 오류 목록. 문제 또는 이슈 ID를 누르면 상세 화면으로
                  이동합니다.
                </caption>
                <thead>
                  <tr>
                    <th>문제 · 이슈 ID</th>
                    <th>앱 · 환경</th>
                    <th>상태</th>
                    <th>저장된 보고 수</th>
                    <th>마지막 발생 (한국 시간)</th>
                  </tr>
                </thead>
                <tbody>
                  {result.items.map((issue) => (
                    <tr key={issue.id}>
                      <td>
                        <Link
                          className={styles.issueLink}
                          href={`/error-analytics-preview/${issue.id}`}
                        >
                          <strong>
                            {issue.error_name} · {issue.message}
                          </strong>
                          <span>{issue.route}</span>
                          <code>{issue.id}</code>
                        </Link>
                      </td>
                      <td>
                        {issue.app}
                        <br />
                        {issue.environment}
                      </td>
                      <td>
                        <span
                          className={`${styles.status} ${issue.status === "open" ? styles.statusOpen : styles.statusInvestigating}`}
                        >
                          {errorStatusLabels[issue.status]}
                        </span>
                      </td>
                      <td>
                        {issue.occurrence_count.toLocaleString("ko-KR")}건
                      </td>
                      <td>
                        {new Intl.DateTimeFormat("ko-KR", {
                          timeZone: "Asia/Seoul",
                          dateStyle: "medium",
                          timeStyle: "short",
                        }).format(new Date(issue.last_seen_at))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {result && (
            <nav className={styles.pagination} aria-label="오류 목록 페이지">
              {query.page > 1 && (
                <>
                  <Link href={errorListLocation({ ...query, page: 1 })}>
                    처음
                  </Link>
                  <Link
                    rel="prev"
                    href={errorListLocation({ ...query, page: query.page - 1 })}
                  >
                    이전
                  </Link>
                </>
              )}
              <span aria-current="page">
                {query.page} / {pages} 페이지
              </span>
              {query.page < pages && (
                <>
                  <Link
                    rel="next"
                    href={errorListLocation({ ...query, page: query.page + 1 })}
                  >
                    다음
                  </Link>
                  <Link href={errorListLocation({ ...query, page: pages })}>
                    마지막
                  </Link>
                </>
              )}
            </nav>
          )}
        </section>
        <ErrorLookupGuide siteId={site.id} />
      </div>
    </main>
  );
}
