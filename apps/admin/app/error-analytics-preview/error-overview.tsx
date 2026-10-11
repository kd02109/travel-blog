import Link from "next/link";
import type { ActionOutput } from "@repo/contracts";
import { errorStatusLabels } from "../../lib/error-analytics";
import styles from "./error-analytics-preview.module.css";

export function ErrorOverview({
  summary,
  period,
  environment,
  app,
}: {
  period: string;
  environment: string;
  app: string;
  summary: ActionOutput<"admin.errors.summary"> | null;
}) {
  return (
    <section
      className={`${styles.issuesPanel} ${styles.overview}`}
      aria-labelledby="overview-title"
    >
      <div className={styles.panelHeading}>
        <div>
          <p className={styles.panelKicker}>선택 조건 집계</p>
          <h2 id="overview-title">오류 현황과 발생 빈도</h2>
        </div>
        <span>
          {app === "all" ? "web · admin" : app} / {environment} / {period}
        </span>
      </div>
      <p className={styles.intro}>
        목록과 동일한 환경·앱·기간·상태·검색 조건입니다.{" "}
        {period === "all"
          ? "보관 중인 이슈의 누적 보고 수이며 삭제한 이슈는 제외합니다."
          : "선택한 기간 안에 저장된 이벤트 수입니다. 이벤트는 14일 보존합니다."}{" "}
        수집 제한이나 통신 실패로 누락된 실제 오류는 포함하지 않습니다.
      </p>
      {!summary ? (
        <p role="alert">
          오류 집계를 불러오지 못했습니다. 페이지를 새로고침해 다시 시도해
          주세요.
        </p>
      ) : (
        <>
          <div className={styles.tableScroll}>
            <table className={styles.table}>
              <caption className={styles.srOnly}>저장된 전체 오류 집계</caption>
              <thead>
                <tr>
                  <th>전체 이슈</th>
                  <th>저장된 보고</th>
                  <th>열림</th>
                  <th>해결됨</th>
                  <th>무시함</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  {[
                    summary.total,
                    summary.occurrences,
                    summary.open,
                    summary.resolved,
                    summary.ignored,
                  ].map((value, index) => (
                    <td key={index}>
                      <strong className={styles.aggregateValue}>
                        {value.toLocaleString("ko-KR")}
                      </strong>
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
          <h3 className={styles.topTitle}>
            저장된 보고가 많은 오류 · 상위 5개
          </h3>
          {summary.top.length === 0 ? (
            <p className={styles.empty}>아직 수집된 오류가 없습니다.</p>
          ) : (
            <div className={styles.tableScroll}>
              <table className={styles.table}>
                <caption className={styles.srOnly}>
                  저장된 보고 횟수 내림차순. 동률이면 최근 발생 순.
                </caption>
                <thead>
                  <tr>
                    <th>순위</th>
                    <th>문제 · 이슈 ID</th>
                    <th>앱 · 환경</th>
                    <th>상태</th>
                    <th>저장된 보고</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.top.map((issue, index) => (
                    <tr key={issue.id}>
                      <td>{index + 1}</td>
                      <td>
                        <Link
                          className={styles.issueLink}
                          href={`/error-analytics-preview/${issue.id}`}
                        >
                          <strong>
                            {issue.error_name} · {issue.message}
                          </strong>
                          <code>{issue.id}</code>
                        </Link>
                      </td>
                      <td>
                        {issue.app}
                        <br />
                        {issue.environment}
                      </td>
                      <td>{errorStatusLabels[issue.status]}</td>
                      <td>
                        <strong>
                          {issue.occurrence_count.toLocaleString("ko-KR")}
                        </strong>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </section>
  );
}
