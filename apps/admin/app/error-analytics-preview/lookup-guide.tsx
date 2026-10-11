import Link from "next/link";
import { CopyButton } from "@repo/ui/copy-button";
import { supabaseDiagnosticLinks } from "../../lib/error-analytics";
import styles from "./error-analytics-preview.module.css";
export function ErrorLookupGuide({
  siteId,
  issueId,
  requestId,
  fingerprint,
  originRequestId,
}: {
  siteId: string;
  issueId?: string;
  requestId?: string | null;
  fingerprint?: string;
  originRequestId?: string | null;
}) {
  const links = supabaseDiagnosticLinks(process.env.NEXT_PUBLIC_SUPABASE_URL);
  // UUIDs/fingerprints originate in validated API contracts. Still quote SQL literals.
  const quote = (value: string) => "'" + value.replaceAll("'", "''") + "'";
  const issueFilter = issueId ? ` and id = ${quote(issueId)}::uuid` : "";
  const eventFilter = issueId ? ` and i.id = ${quote(issueId)}::uuid` : "";
  const sql = `-- 실행 위치: Supabase SQL Editor (PostgreSQL). Logs Explorer용 쿼리가 아닙니다.
-- 현재 사이트${issueId ? "의 선택한 이슈" : "의 최근 이슈 50개"}를 조회합니다.
select id, app, environment, status, fingerprint, occurrence_count,
  last_seen_at, last_request_id, last_origin_request_id
from app_private.web_error_issues
where site_id = ${quote(siteId)}::uuid${issueFilter}
order by last_seen_at desc, id limit 50;

-- 14일 보존 범위의 최근 발생 기록 100개 (메시지·스택은 마스킹됨).
select e.id, e.received_at, e.request_id, e.origin_request_id,
  e.release, e.operation, e.http_status, e.masked_message, e.masked_stack
from app_private.web_error_events e
join app_private.web_error_issues i on i.id = e.issue_id
where i.site_id = ${quote(siteId)}::uuid${eventFilter}
order by e.received_at desc, e.id limit 100;${
    fingerprint
      ? `

-- 같은 fingerprint를 앱·환경별로 비교합니다.
select id, app, environment, status from app_private.web_error_issues
where site_id = ${quote(siteId)}::uuid and fingerprint = ${quote(fingerprint)};`
      : ""
  }`;
  return (
    <section className={styles.guide} aria-labelledby="lookup-guide-title">
      <h2 id="lookup-guide-title">ID로 오류 추적하기</h2>
      <dl>
        <dt>이슈 ID</dt>
        <dd>
          같은 오류를 묶은 항목의 고유 UUID입니다. 이메일의 이슈 ID를 목록
          검색에 붙여 넣거나 상세 주소로 이동하세요.
          {issueId && (
            <>
              {" "}
              <Link href={`/error-analytics-preview/${issueId}`}>
                이 이슈의 고정 상세 링크
              </Link>
            </>
          )}
        </dd>
        <dt>수집 요청 ID</dt>
        <dd>
          오류 보고가 travel-api에 도착했을 때 발급한 ID입니다. 목록에서
          검색하면 보존 중인 발생 기록이 연결된 이슈를 찾습니다. 원래 실패한
          요청의 ID와는 다릅니다.
          {requestId && (
            <>
              {" "}
              <Link
                href={`/error-analytics-preview?search=${encodeURIComponent(requestId)}`}
              >
                이 수집 요청 검색
              </Link>
            </>
          )}
        </dd>
        <dt>원래 실패 요청 ID</dt>
        <dd>
          오류를 일으킨 API·Next 요청의 ID입니다. 수집된 경우 목록 검색 또는
          발생 기록의 origin_request_id로 찾으세요. 해당 서비스의 로그에서 같은
          ID를 검색하면 연관 지점을 확인할 수 있습니다. 모든 성공 요청이나 오류
          원문이 서버 로그에 저장되는 것은 아닙니다.
        </dd>
        <dt>fingerprint</dt>
        <dd>
          같은 종류의 오류를 묶는 64자리 해시입니다. 원본 오류로 복호화할 수
          없습니다. 사이트·앱·환경이 다르면 같은 해시라도 별도 이슈입니다.
          {fingerprint && (
            <>
              {" "}
              <Link href={`/error-analytics-preview?search=${fingerprint}`}>
                같은 fingerprint 검색
              </Link>
            </>
          )}
        </dd>
      </dl>
      <p>
        상세 화면은 이벤트를 20건씩 표시하며 이전 발생 기록으로 이동할 수
        있습니다. 발생 기록과 메시지·스택은 14일 보존 후 정리되어 오래된 요청
        ID나 원문을 찾지 못할 수 있습니다. 이슈 집계와 상태는 별도로 남습니다.
      </p>
      <section
        className={styles.lookupSection}
        aria-labelledby="sql-editor-title"
      >
        <h3 id="sql-editor-title">1. 저장된 오류 데이터 → SQL Editor</h3>
        <p>
          이슈 ID·fingerprint·수집 요청 ID는 먼저 DB에서 조회하세요. 아래 SQL은
          PostgreSQL의 app_private 테이블을 조회하며, 현재 사이트 ID가 이미 들어
          있어 바로 실행할 수 있습니다.
        </p>
        <div className={styles.lookupTools}>
          {links && (
            <a href={links.sql} target="_blank" rel="noreferrer">
              Supabase SQL Editor 열기 ↗
            </a>
          )}
          <CopyButton text={sql} label="SQL Editor용 조회 SQL 전체 복사" />
        </div>
        <details>
          <summary>복사해서 실행할 조회 SQL · SQL Editor 전용</summary>
          <pre>{sql}</pre>
        </details>
      </section>
      <section
        className={styles.lookupSection}
        aria-labelledby="logs-explorer-title"
      >
        <h3 id="logs-explorer-title">2. 함수 실행 당시 기록 → Logs Explorer</h3>
        <p>
          위 테이블 조회 SQL은 여기서 실행하지 않습니다. SQL 없이 검색하려면
          Supabase Logs에서 시간 범위와 Edge Function 유형을 선택하고
          travel-api의 이벤트 메시지에 기록된 request_id와 비교하세요.
          Explorer에서 SQL로 검색하려면 조회 소스를 Logs로 선택하고 로그 전용
          쿼리를 사용합니다. Database 소스를 쓰는 테이블 조회와는 다릅니다. 수집
          요청 ID는 오류 보고 요청, 원래 실패 요청 ID는 오류가 발생한 요청을
          가리킵니다.
        </p>
        {links && (
          <a href={links.logs} target="_blank" rel="noreferrer">
            Supabase Logs Explorer 열기 ↗
          </a>
        )}
        <p>
          <a
            href="https://supabase.com/docs/guides/observability/advanced-log-filtering"
            target="_blank"
            rel="noreferrer"
          >
            Logs Explorer 쿼리 작성 안내 ↗
          </a>
        </p>
        {requestId && (
          <div className={styles.lookupTools}>
            <span>
              수집 요청 ID: <code>{requestId}</code>
            </span>
            <CopyButton text={requestId} label="수집 요청 ID 복사" />
          </div>
        )}
        {originRequestId && (
          <div className={styles.lookupTools}>
            <span>
              원래 실패 요청 ID: <code>{originRequestId}</code>
            </span>
            <CopyButton text={originRequestId} label="원래 실패 요청 ID 복사" />
          </div>
        )}
        <p>
          모든 요청 ID가 실행 로그에 출력되는 것은 아니므로 검색 결과가 없을 수
          있습니다. 이슈 ID와 fingerprint는 DB 검색용이며 함수 로그의 공통 검색
          키가 아닙니다. Next.js 서버 오류는 해당 web/admin Vercel 프로젝트의
          Runtime Logs에서 발생 시간·경로·원래 요청 ID를 비교하세요. 실행 로그의
          보존 기간은 서비스 요금제와 설정에 따라 DB의 14일 보존과 다를 수
          있습니다.
        </p>
      </section>
      <p>
        Supabase 프로젝트 권한이 있는 계정으로 열어 주세요. 앱의 owner/admin
        권한과 콘솔 접근 권한은 별개입니다. 수집되지 않았거나 마스킹·삭제된
        원문은 이 조회로 복원되지 않습니다.
      </p>
    </section>
  );
}
