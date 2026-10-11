import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { TravelApiError } from "@repo/api-client";
import { requireEditor } from "../../lib/auth";
import styles from "./error-analytics-preview.module.css";

export const metadata: Metadata = {
  title: "웹 오류 분석 시안 | 관리자",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

const trend = [2, 1, 3, 2, 4, 5, 6, 8, 7, 3, 4, 2];

const issues = [
  {
    id: "WEB-202",
    title: "사진 보기 화면을 열 수 없음",
    signature: "TypeError · render_boundary",
    route: "/posts/:id",
    count: 21,
    source: "브라우저",
    lastSeen: "16:42",
    status: "열림",
  },
  {
    id: "WEB-117",
    title: "카카오 로그인 후 돌아오지 못함",
    signature: "AuthCallbackError · next_route",
    route: "/auth",
    count: 15,
    source: "서버",
    lastSeen: "15:38",
    status: "열림",
  },
  {
    id: "WEB-341",
    title: "댓글을 불러오는 데 실패",
    signature: "TravelApiError · unhandled_rejection",
    route: "/posts/:id",
    count: 11,
    source: "브라우저",
    lastSeen: "14:51",
    status: "열림",
  },
] as const;

export default async function ErrorAnalyticsPreviewPage() {
  const { membership, site, api } = await requireEditor();
  if (membership.role !== "owner" && membership.role !== "admin") {
    redirect("/forbidden");
  }

  let liveIssues: Awaited<ReturnType<typeof api.listAdminErrors>> | null = null;
  try {
    liveIssues = await api.listAdminErrors({
      site_id: site.id,
      limit: 20,
      offset: 0,
    });
  } catch (error) {
    if (error instanceof TravelApiError) {
      if (error.status === 401) redirect("/login?error=expired");
      if (error.status === 403) redirect("/forbidden");
    }
  }

  return (
    <main className={styles.page}>
      <div className={styles.content}>
        <div className={styles.previewBanner} role="note">
          <span className={styles.previewDot} aria-hidden="true" />
          <strong>화면 시안</strong>
          <span>
            아래 분석 차트와 WEB-202 목록은 예시입니다. 실제 수집 기록은 페이지
            아래쪽에 별도로 표시합니다.
          </span>
        </div>

        <header className={styles.header}>
          <div>
            <p className={styles.eyebrow}>운영 상태 / 공개 블로그</p>
            <h1>웹 오류 분석</h1>
            <p className={styles.intro}>
              방문자가 겪은 오류를 화면과 원인별로 묶어 확인합니다.
            </p>
          </div>
          <div className={styles.period} aria-label="예시 집계 기간">
            <span className={styles.periodLabel}>집계 기간</span>
            <strong>최근 24시간</strong>
            <span>예시 데이터 · 운영 환경</span>
          </div>
        </header>

        <section aria-labelledby="error-summary-title">
          <div className={styles.sectionHeading}>
            <h2 id="error-summary-title">한눈에 보기</h2>
            <span>방문자 정보는 이 화면에 표시하지 않습니다</span>
          </div>
          <div className={styles.metrics}>
            <article className={`${styles.metric} ${styles.metricPrimary}`}>
              <span className={styles.metricLabel}>오류 발생</span>
              <strong>
                47<span>건</span>
              </strong>
              <p>24시간 동안 수집된 이벤트</p>
            </article>
            <article className={styles.metric}>
              <span className={styles.metricLabel}>열린 문제</span>
              <strong>
                3<span>개</span>
              </strong>
              <p>원인별로 묶은 오류</p>
            </article>
            <article className={styles.metric}>
              <span className={styles.metricLabel}>서버에서 기록</span>
              <strong>
                18<span>건</span>
              </strong>
              <p>서버에서 수집한 오류 이벤트</p>
            </article>
            <article className={styles.metric}>
              <span className={styles.metricLabel}>해결한 문제</span>
              <strong>
                2<span>개</span>
              </strong>
              <p>선택한 기간에 종료됨</p>
            </article>
          </div>
        </section>

        <div className={styles.middleGrid}>
          <section className={styles.chartPanel} aria-labelledby="trend-title">
            <div className={styles.panelHeading}>
              <div>
                <p className={styles.panelKicker}>발생 흐름</p>
                <h2 id="trend-title">시간대별 오류</h2>
              </div>
              <span className={styles.chartLegend}>
                <i aria-hidden="true" /> 오류 건수
              </span>
            </div>
            <figure>
              <div
                className={styles.chart}
                role="img"
                aria-label="예시 오류 47건의 2시간 단위 추이. 14시에서 16시 사이에 8건으로 가장 많습니다."
              >
                {trend.map((count, index) => (
                  <div className={styles.chartColumn} key={index}>
                    <span
                      className={`${styles.bar} ${count >= 7 ? styles.barPeak : ""}`}
                      style={{ height: `${(count / 8) * 100}%` }}
                    />
                  </div>
                ))}
              </div>
              <figcaption className={styles.chartAxis}>
                <span>00:00</span>
                <span>06:00</span>
                <span>12:00</span>
                <span>18:00</span>
                <span>24:00</span>
              </figcaption>
            </figure>
          </section>

          <section
            className={styles.priorityPanel}
            aria-labelledby="priority-title"
          >
            <p className={styles.panelKicker}>우선 확인</p>
            <h2 id="priority-title">사진 보기 화면 오류</h2>
            <p className={styles.priorityDescription}>
              오류가 가장 많이 발생했습니다. 먼저 이 화면의 배포 변경과 API
              응답을 살펴보세요.
            </p>
            <dl className={styles.priorityFacts}>
              <div>
                <dt>오류 코드</dt>
                <dd>WEB-202</dd>
              </div>
              <div>
                <dt>마지막 발생</dt>
                <dd>16:42</dd>
              </div>
              <div>
                <dt>발생 화면</dt>
                <dd>/posts/:id</dd>
              </div>
            </dl>
            <p className={styles.priorityFootnote}>
              아래 실제 수집 기록의 상세 화면에서는 마스킹된 오류 메시지와 스택,
              릴리스, 요청 ID를 확인할 수 있습니다.
            </p>
          </section>
        </div>

        <section className={styles.issuesPanel} aria-labelledby="issues-title">
          <div className={styles.panelHeading}>
            <div>
              <p className={styles.panelKicker}>문제 목록</p>
              <h2 id="issues-title">지금 확인할 오류</h2>
            </div>
            <span className={styles.tableCount}>예시 문제 3개</span>
          </div>
          <div className={styles.tableScroll}>
            <table className={styles.table}>
              <caption className={styles.srOnly}>
                예시 웹 오류의 상태, 발생 화면, 발생 건수, 수집 출처, 마지막
                발생 시각
              </caption>
              <thead>
                <tr>
                  <th scope="col">문제</th>
                  <th scope="col">화면</th>
                  <th scope="col">상태</th>
                  <th scope="col" className={styles.numeric}>
                    발생
                  </th>
                  <th scope="col">출처</th>
                  <th scope="col">마지막</th>
                </tr>
              </thead>
              <tbody>
                {issues.map((issue) => (
                  <tr key={issue.id}>
                    <td>
                      <div className={styles.issueName}>
                        <span className={styles.issueId}>{issue.id}</span>
                        <strong>{issue.title}</strong>
                      </div>
                      <span className={styles.signature}>
                        {issue.signature}
                      </span>
                    </td>
                    <td className={styles.route}>{issue.route}</td>
                    <td>
                      <span
                        className={`${styles.status} ${issue.status === "열림" ? styles.statusOpen : styles.statusInvestigating}`}
                      >
                        {issue.status}
                      </span>
                    </td>
                    <td className={styles.numeric}>{issue.count}건</td>
                    <td>{issue.source}</td>
                    <td className={styles.timestamp}>{issue.lastSeen}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section
          className={styles.livePanel}
          aria-labelledby="live-issues-title"
        >
          <div className={styles.panelHeading}>
            <div>
              <p className={styles.panelKicker}>실제 수집 기록</p>
              <h2 id="live-issues-title">저장된 오류 상세 보기</h2>
            </div>
            <span className={styles.tableCount}>최근 20개까지 표시</span>
          </div>
          {liveIssues === null ? (
            <p className={styles.liveNote}>
              현재 오류 기록을 조회할 수 없습니다. 상세 API 배포와 접속 상태를
              확인하세요.
            </p>
          ) : liveIssues.length === 0 ? (
            <p className={styles.liveNote}>아직 수집된 오류가 없습니다.</p>
          ) : (
            <ul className={styles.liveList}>
              {liveIssues.map((issue) => (
                <li key={issue.id}>
                  <Link href={`/error-analytics-preview/${issue.id}`}>
                    <strong>{issue.error_name}</strong>
                    <span>{issue.route}</span>
                    <span>{issue.occurrence_count}건 · 상세 보기 →</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <aside
          className={styles.dataNote}
          aria-label="실제 기능 연결 시 수집 범위"
        >
          <div>
            <p className={styles.panelKicker}>데이터 수집 원칙</p>
            <h2>오류를 이해하는 데 필요한 정보만 남깁니다</h2>
          </div>
          <p>
            앱·환경·화면 경로·오류 코드·발생 시각·릴리스·요청 ID와 마스킹된
            메시지·스택을 기록합니다. 이메일, 입력 내용, 인증 토큰, 전체 URL
            쿼리와 원본 요청 본문은 저장하지 않습니다.
          </p>
        </aside>
      </div>
    </main>
  );
}
