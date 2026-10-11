import type { ActionOutput } from "@repo/contracts";
import styles from "./error-analytics-preview.module.css";
const date = (value: string | null) =>
  value
    ? new Date(value).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })
    : "미확인";
export function ErrorHealth({
  health,
}: {
  health: ActionOutput<"admin.errors.health"> | null;
}) {
  const collectionEnabled =
    process.env.NEXT_PUBLIC_ERROR_MONITORING_ENABLED === "true";
  const emailEnabled = process.env.TRAVEL_ERROR_EMAIL_ENABLED === "true";
  return (
    <section
      className={`${styles.issuesPanel} ${styles.overview}`}
      aria-labelledby="health-title"
    >
      <div className={styles.panelHeading}>
        <h2 id="health-title">수집·알림 상태</h2>
        <span>현재 admin 실행 환경: {process.env.VERCEL_ENV ?? "local"}</span>
      </div>
      <p>
        이 admin의 수집 설정: {collectionEnabled ? "켜짐" : "꺼짐"} · 발송 설정:{" "}
        {emailEnabled ? "켜짐" : "꺼짐"}. 블로그 설정과 스케줄러 정상 실행
        여부는 별도 확인이 필요합니다.
      </p>
      {!health ? (
        <p role="alert">
          운영 상태를 조회하지 못했습니다. 정상 상태로 판단할 수 없습니다.
        </p>
      ) : (
        <>
          {health.collection.length === 0 ? (
            <p>
              선택한 환경·앱의 수집 상태 기록이 없습니다. 오류가 없거나 감시가
              비활성일 수 있으므로 미확인 상태입니다.
            </p>
          ) : (
            <div className={styles.tableScroll}>
              <table className={styles.table}>
                <caption className={styles.srOnly}>
                  신규 관측 기능 적용 이후 누적. 기간·상태·검색 필터는 적용하지
                  않습니다.
                </caption>
                <thead>
                  <tr>
                    <th>앱 · 환경</th>
                    <th>저장</th>
                    <th>중복 제외</th>
                    <th>제한</th>
                    <th>저장 실패</th>
                    <th>최근 저장 (한국 시간)</th>
                    <th>최근 이메일 실행</th>
                  </tr>
                </thead>
                <tbody>
                  {health.collection.map((row) => (
                    <tr key={`${row.app}:${row.environment}`}>
                      <td>
                        {row.app} · {row.environment}
                      </td>
                      <td>{row.accepted}</td>
                      <td>{row.duplicates}</td>
                      <td>{row.limited}</td>
                      <td>{row.failed}</td>
                      <td>{date(row.last_accepted_at)}</td>
                      <td>
                        {date(row.last_email_run_at)}
                        <br />
                        {row.last_email_result ?? "미확인"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p>
            선택 환경의 전체 앱 이메일: 대기/발송 중 {health.email.pending} ·
            실패 {health.email.failed} · 서비스 접수 {health.email.accepted}.
            접수는 받은편지함 도착을 뜻하지 않습니다.
          </p>
        </>
      )}
      <p className={styles.intro}>
        수집 지표는 새 관측 기능 적용 이후 누적이며 목록의 기간·상태·검색과
        무관합니다. DB에 도달하지 못한 장애는 포함되지 않습니다. 마지막 오류
        수집 시각만으로 서비스 가용성을 판단하지 마세요.
      </p>
    </section>
  );
}
