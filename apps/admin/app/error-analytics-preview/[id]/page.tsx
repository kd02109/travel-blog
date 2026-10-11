import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { TravelApiError } from "@repo/api-client";
import { requireEditor } from "../../../lib/auth";
import { IssueActions } from "../issue-actions";
import { ErrorLookupGuide } from "../lookup-guide";
import styles from "./error-detail.module.css";

export const metadata: Metadata = {
  title: "웹 오류 상세 | 관리자",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const dateFormatter = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  dateStyle: "medium",
  timeStyle: "short",
});

function formatDate(value: string) {
  return dateFormatter.format(new Date(value));
}

const statusLabels = {
  open: "열림",
  resolved: "해결됨",
  ignored: "무시함",
};

const sourceLabels = {
  browser: "브라우저",
  next_server: "Next.js 서버",
  edge_api: "Edge API",
};

const dependencyLabels = {
  travel_api: "travel-api",
  supabase_auth: "Supabase Auth",
  supabase_storage: "Supabase Storage",
  next_server: "Next.js 서버",
  browser: "브라우저",
  other: "기타",
};

type DiagnosticContext = {
  operation: string | null;
  dependency: keyof typeof dependencyLabels | null;
  http_status: number | null;
  origin_request_id: string | null;
  stack_frames: {
    function_name: string | null;
    file: string;
    line: number;
    column: number;
  }[];
};

function DiagnosticDetails({ context }: { context: DiagnosticContext }) {
  return (
    <>
      <dl className={styles.contextGrid}>
        <div>
          <dt>작업 코드</dt>
          <dd className={styles.mono}>{context.operation ?? "기록 없음"}</dd>
        </div>
        <div>
          <dt>의존 서비스</dt>
          <dd>
            {context.dependency
              ? dependencyLabels[context.dependency]
              : "기록 없음"}
          </dd>
        </div>
        <div>
          <dt>HTTP 상태</dt>
          <dd>{context.http_status ?? "기록 없음"}</dd>
        </div>
        <div>
          <dt>원래 실패 요청 ID</dt>
          <dd className={styles.mono}>
            {context.origin_request_id ?? "기록 없음"}
          </dd>
        </div>
      </dl>
      <h3 className={styles.framesTitle}>코드 위치 · 최대 10개 프레임</h3>
      {context.stack_frames.length === 0 ? (
        <p className={styles.empty}>
          이벤트에서 안전한 코드 위치를 추출하지 못했습니다.
        </p>
      ) : (
        <ol className={styles.frames}>
          {context.stack_frames.map((frame, index) => (
            <li key={`${frame.file}:${frame.line}:${frame.column}:${index}`}>
              <span>{frame.function_name ?? "이름 없는 함수"}</span>
              <code>
                {frame.file}:{frame.line}:{frame.column}
              </code>
            </li>
          ))}
        </ol>
      )}
    </>
  );
}

function unavailable() {
  return (
    <main className={styles.page}>
      <div className={styles.content}>
        <Link className={styles.backLink} href="/error-analytics-preview">
          ← 웹 오류 분석으로 돌아가기
        </Link>
        <section className={styles.panel} role="status">
          <h1>오류 상세를 불러오지 못했습니다</h1>
          <p>
            잠시 후 다시 열어 주세요. 오류 데이터나 요청 세부정보는 이 화면에
            표시하지 않습니다.
          </p>
        </section>
      </div>
    </main>
  );
}

export default async function ErrorDetailPage({
  params,
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
  params: Promise<{ id: string }>;
}) {
  const { membership, site, api, user } = await requireEditor();
  if (membership.role !== "owner" && membership.role !== "admin")
    redirect("/forbidden");

  const { id } = await params;
  if (!uuidPattern.test(id)) notFound();

  const query = await searchParams;
  const before = typeof query.before === "string" ? query.before : undefined;
  const before_id =
    typeof query.before_id === "string" ? query.before_id : undefined;
  if (
    Boolean(before) !== Boolean(before_id) ||
    (before_id && !uuidPattern.test(before_id)) ||
    (before && !Number.isFinite(Date.parse(before)))
  )
    notFound();
  let eventPage;
  let detail;
  try {
    [detail, eventPage] = await Promise.all([
      api.getAdminError({ site_id: site.id, id }),
      api.getAdminErrorEvents({ site_id: site.id, id, before, before_id }),
    ]);
  } catch (error) {
    if (error instanceof TravelApiError) {
      if (error.status === 404) notFound();
      if (error.status === 401) redirect("/login?error=expired");
      if (error.status === 403) redirect("/forbidden");
    }
    return unavailable();
  }

  const { issue } = detail;
  const events = eventPage.items;
  const latest = detail.events[0];
  const currentMessage = latest?.masked_message ?? issue.masked_message;
  const currentStack = latest?.masked_stack ?? issue.masked_stack;
  const currentContext = latest ?? issue;

  return (
    <main className={styles.page}>
      <div className={styles.content}>
        <Link className={styles.backLink} href="/error-analytics-preview">
          ← 웹 오류 분석으로 돌아가기
        </Link>

        <header className={styles.header}>
          <div>
            <p className={styles.eyebrow}>
              운영 상태 / {issue.app} / {issue.environment}
            </p>
            <h1>{issue.error_name}</h1>
            <p className={styles.headerIntro}>
              동일한 오류로 묶인 발생 기록입니다. 메시지와 스택은 수집 전에
              마스킹한 값만 표시합니다.
            </p>
          </div>
          <span className={`${styles.status} ${styles[issue.status]}`}>
            {statusLabels[issue.status]}
          </span>
        </header>

        <IssueActions
          siteId={site.id}
          actorId={user.id}
          id={issue.id}
          count={issue.occurrence_count}
          status={issue.status}
        />

        <section className={styles.summary} aria-label="오류 요약">
          <article className={styles.summaryCard}>
            <span>누적 저장 보고</span>
            <strong>{issue.occurrence_count.toLocaleString("ko-KR")}건</strong>
          </article>
          <article className={styles.summaryCard}>
            <span>처음 발생</span>
            <strong>{formatDate(issue.first_seen_at)}</strong>
          </article>
          <article className={styles.summaryCard}>
            <span>마지막 발생</span>
            <strong>{formatDate(issue.last_seen_at)}</strong>
          </article>
          <article className={styles.summaryCard}>
            <span>발생 화면</span>
            <strong className={styles.mono}>{issue.route}</strong>
          </article>
        </section>

        <div className={styles.columns}>
          <div className={styles.mainColumn}>
            <section
              className={styles.panel}
              aria-labelledby="masked-raw-title"
            >
              <div className={styles.sectionHeading}>
                <div>
                  <p className={styles.eyebrow}>최신 발생 기록</p>
                  <h2 id="masked-raw-title">마스킹된 오류 원문</h2>
                </div>
                <span className={styles.badge}>수집 시 마스킹</span>
              </div>
              <p className={styles.sectionIntro}>
                오류 객체의 메시지와 스택만 제한된 길이로 저장합니다. 아래
                텍스트는 HTML로 해석하지 않습니다.
              </p>
              <div className={styles.rawField}>
                <h3>메시지</h3>
                <pre>
                  {currentMessage ??
                    "이 발생 기록에는 마스킹된 메시지가 없습니다. 이전 수집 버전에서 기록되었을 수 있습니다."}
                </pre>
              </div>
              <div className={styles.rawField}>
                <h3>스택</h3>
                <pre>
                  {currentStack ??
                    "이 발생 기록에는 마스킹된 스택이 없습니다. 브라우저 또는 수집 경로가 스택을 제공하지 않았을 수 있습니다."}
                </pre>
              </div>
              <p className={styles.safetyNote}>
                쿠키, 토큰, 요청 본문, 전체 URL, 방문자 식별자는 함께 저장하지
                않습니다. 마스킹되지 않은 개인정보가 보이면 해당 데이터를
                공유하지 말고 수집 규칙을 점검하세요.
              </p>
            </section>

            <section className={styles.panel} aria-labelledby="context-title">
              <div className={styles.sectionHeading}>
                <div>
                  <p className={styles.eyebrow}>최신 발생의 안전한 맥락</p>
                  <h2 id="context-title">어디서, 무엇을 하다 실패했는지</h2>
                </div>
                <span className={styles.badge}>구조화된 진단 정보</span>
              </div>
              <p className={styles.sectionIntro}>
                작업 코드와 상태, 상대 파일 경로 및 줄·열 번호만 수집합니다.
                전체 URL이나 요청 본문은 저장하지 않습니다. 이 화면은 소스맵을
                자동 해석하지 않으며 배포 릴리스와 코드 위치를 대조하는
                단서입니다.
              </p>
              <DiagnosticDetails context={currentContext} />
            </section>

            <section className={styles.panel} aria-labelledby="events-title">
              <div className={styles.sectionHeading}>
                <div>
                  <p className={styles.eyebrow}>발생 이력</p>
                  <h2 id="events-title">최근 이벤트 {events.length}건</h2>
                </div>
                <span className={styles.muted}>최신 20건까지 표시</span>
              </div>
              {events.length === 0 ? (
                <p className={styles.empty}>
                  아직 조회할 발생 기록이 없습니다.
                </p>
              ) : (
                <ol className={styles.eventList}>
                  {events.map((event) => (
                    <li
                      className={styles.event}
                      key={event.id}
                      id={`event-${event.id}`}
                    >
                      <div className={styles.eventHeading}>
                        <strong>{formatDate(event.received_at)}</strong>
                        <span>{sourceLabels[event.source]}</span>
                      </div>
                      <p>
                        {event.error_name} · <code>{event.route}</code>
                      </p>
                      <p className={styles.eventMeta}>
                        이벤트 ID {event.id} · 릴리스{" "}
                        {event.release ?? "기록 없음"} · 수집 요청 ID{" "}
                        {event.request_id ?? "기록 없음"}
                      </p>
                      {(event.masked_message ||
                        event.masked_stack ||
                        event.stack_frames.length > 0 ||
                        event.origin_request_id ||
                        event.operation) && (
                        <details className={styles.eventDetails}>
                          <summary>
                            이벤트 메시지·코드 위치·요청 맥락 보기
                          </summary>
                          <DiagnosticDetails context={event} />
                          <div className={styles.rawField}>
                            <h3>메시지</h3>
                            <pre>{event.masked_message ?? "기록 없음"}</pre>
                          </div>
                          <div className={styles.rawField}>
                            <h3>스택</h3>
                            <pre>{event.masked_stack ?? "기록 없음"}</pre>
                          </div>
                        </details>
                      )}
                    </li>
                  ))}
                </ol>
              )}
              <nav
                aria-label="오류 발생 기록 페이지"
                className="flex gap-4 py-4"
              >
                {before && (
                  <Link href={`/error-analytics-preview/${id}`}>
                    최근 기록으로
                  </Link>
                )}
                {eventPage.next && (
                  <Link
                    href={`/error-analytics-preview/${id}?${new URLSearchParams(eventPage.next)}`}
                  >
                    이전 발생 기록 20개
                  </Link>
                )}
                {!eventPage.next && (
                  <span>보존 중인 기록의 마지막 페이지입니다.</span>
                )}
              </nav>
            </section>
          </div>

          <aside className={styles.sideColumn} aria-label="오류 식별 정보">
            <section className={styles.panel}>
              <h2>해결 기록</h2>
              <p>
                최근 해결 표시:{" "}
                {issue.resolved_at
                  ? formatDate(issue.resolved_at)
                  : "기록 없음"}
              </p>
              <p>처리자 ID: {issue.resolved_by ?? "기록 없음"}</p>
              <p>해결 릴리스: {issue.resolved_release ?? "기록 없음"}</p>
              <p>해결 메모: {issue.resolution_note ?? "기록 없음"}</p>
              <p>
                그룹 규칙: v{issue.fingerprint_version ?? 1}. v2 적용 이전
                이슈는 별도로 유지합니다.
              </p>
            </section>
            <section className={styles.panel}>
              <p className={styles.eyebrow}>오류 식별</p>
              <h2>수집된 단서</h2>
              <dl className={styles.facts}>
                <div>
                  <dt>이슈 ID</dt>
                  <dd className={styles.mono}>{issue.id}</dd>
                </div>
                <div>
                  <dt>최근 수집 출처</dt>
                  <dd>{sourceLabels[issue.source]}</dd>
                </div>
                <div>
                  <dt>최근 릴리스</dt>
                  <dd>{issue.release ?? "기록 없음"}</dd>
                </div>
                <div>
                  <dt>최근 수집 요청 ID</dt>
                  <dd className={styles.mono}>
                    {issue.request_id ?? "기록 없음"}
                  </dd>
                </div>
                <div>
                  <dt>fingerprint</dt>
                  <dd className={styles.mono}>{issue.fingerprint}</dd>
                </div>
              </dl>
            </section>
            <section className={styles.panel}>
              <p className={styles.eyebrow}>처리 안내</p>
              <h2>해결 후 확인</h2>
              <ol className={styles.workflow}>
                <li>
                  수정 배포 후 같은 화면에서 오류가 재현되지 않는지 확인합니다.
                </li>
                <li>
                  새 릴리스에서 같은 fingerprint의 재발 여부를 관찰합니다.
                </li>
                <li>
                  수정 배포를 확인한 뒤 해결됨으로 처리합니다. 재발하면 자동으로
                  다시 열립니다.
                </li>
              </ol>
              <p className={styles.sectionIntro}>
                상태 변경·삭제는 관리 감사 기록에 남습니다. 해결됨 처리는 오류
                발생 원인 자체를 수정하지 않습니다.
              </p>
            </section>
          </aside>
        </div>
        <ErrorLookupGuide
          siteId={site.id}
          issueId={issue.id}
          requestId={issue.request_id}
          fingerprint={issue.fingerprint}
          originRequestId={issue.origin_request_id}
        />
      </div>
    </main>
  );
}
