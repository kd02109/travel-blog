# `travel-blog-staging` 과거 검증 기록

2026-10-08에 격리 Supabase 프로젝트 `bnfihijsquvvkneoutie`(서울 리전)를 생성해 아래 검사를 수행했다. 당시 `travel-blog` 운영 후보 DB는 조회만 했고 reset·테스트 fixture·Edge 변경을 적용하지 않았다. 현재 정책은 **단일 원격 `travel-blog`**이며, `travel-blog-staging`은 활성 배포·Preview 대상이 아니다. 과거 프로젝트는 삭제·병합하지 않았고 기록을 보존한다. 사이트 ID와 원본 파일명↔원격 버전 대응표는 [staging-deployment.json](./staging-deployment.json)에 있다.

## 적용 상태

| 대상         | 실제 결과                                                                                                                                                                                                                                                        |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| DB           | 빈 프로젝트에 `supabase/migrations` SQL 33개를 순서대로 적용했다. 사이트 1개, 앱 테이블 19개 모두 RLS 활성, Storage 버킷 4개 모두 private 상태를 확인했다.                                                                                                       |
| API          | 로컬 `supabase/functions/travel-api` 소스를 staging `travel-api` v3로 배포했다. 공개/비회원 action의 내부 인증을 위해 `verify_jwt=false`이며, 보호 action은 함수에서 Auth와 membership을 검사한다.                                                               |
| 환경별 owner | 지정된 owner 이메일을 `owner_bootstrap_targets`에 설정했다. 실제 staging Auth 가입이 아직 없으므로 `site_memberships`는 0개다. 가짜 사용자로 이메일 인증 후 owner 자동 부여를 rollback 검증했다.                                                                 |
| 오류 수집    | staging 전용 `TRAVEL_ERROR_REPORT_KEY`를 Edge secret에 설정했다. 키 없는 수집 403, 키 있는 수집 202와 마스킹된 DB 이벤트 저장을 확인했다. 일회용 실제 Auth JWT로 admin 목록·상세 200, editor 403, 권한 회수 후 403을 확인하고 테스트 계정·membership을 삭제했다. |
| 미디어 권한  | `process_asset`만 claim, 만료된 삭제 lease 재획득, 참조 재검사·격리, anon/authenticated의 내부 RPC 거절을 rollback SQL로 검증했다. 실제 Storage 객체의 변환·삭제 실패 재시도는 Vercel Preview 종단 검사로 남겼다.                                                |

`initial_owner.sql`, `auth_revocation.sql`, `api.sql`, `constraints.sql`, `home_covers.sql`, `error_context.sql`, `media_serverless_claim_retry.sql`의 단일 세션 rollback 테스트가 통과했다. `home_covers.sql`에서 PL/pgSQL 변수와 컬럼의 `photo_id` 이름 충돌을 발견해 컬럼 별칭을 명시한 뒤 재실행했다. `node --test supabase/tests/http_test.ts`의 공개 조회·무인증 거절·방문자 토큰·CORS 4개도 통과했다. 당시 HTTP 검사에는 staging ref가 코드에 고정돼 있었고 방문자/rate-limit 행을 생성했다. 현재 테스트 대상 선택 방식은 해당 역사적 기록과 다를 수 있다.

이후 CORS를 정확한 Origin 허용 목록으로 변경하고 Edge v3를 배포했다. 당시 staging의 `TRAVEL_API_ALLOWED_ORIGINS`에는 localhost와 127.0.0.1의 web/admin 포트 3000·3002만 등록했다. 네 localhost/loopback 출처의 preflight는 허용된 값을 그대로 반환하고 `Vary: Origin`을 포함했다. 등록되지 않은 브라우저 출처는 403 및 `origin_not_allowed`로 거절됐고, Origin 없는 서버 요청과 허용된 POST는 성공했다. 이 결과는 `travel-blog` Edge v19의 동작을 증명하지 않는다. 단일 프로젝트의 최신 Edge를 배포할 때 고정 Preview와 운영 HTTPS 출처를 동일 프로젝트의 허용 목록에 추가해야 한다.

보안 Advisor는 [RLS 정책 없음 안내](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy) 1건을 표시했다. 대상은 비공개 `app_private.owner_bootstrap_targets`로, RLS와 접근권한 회수를 적용하고 클라이언트 정책은 의도적으로 만들지 않았다. 성능 Advisor의 미사용 인덱스 안내 29건은 데이터가 거의 없는 신규 staging의 관측값이다.

## 마이그레이션 이력 주의

MCP `apply_migration`이 33개 중 32개에 로컬 파일명과 다른 원격 버전을 기록했다. SQL 본문과 적용 순서는 확인했지만 버전 이력이 달라 **이 staging에는 `supabase db push`를 실행하지 않는다.** 직접 SQL로 이력을 고치려는 시도는 자동 승인 심사에서 거절됐고 중단했다. 향후 자동 배포 전에는 [Supabase의 공식 migration repair 절차](https://supabase.com/docs/reference/cli/supabase-migration-repair)를 기준으로 원본 버전과 원격 기록을 검토·승인받아 정합화해야 한다. 그 전의 추가 schema 변경은 원본 SQL과 staging 적용 버전을 별도로 기록한다.

## 현재 정책에 따른 남은 확인

- 실제 지정 owner의 앱 Auth 가입·이메일 인증·membership 및 web/admin Kakao callback·로그아웃은 단일 `travel-blog`에서 제한된 smoke로 확인한다. SQL 가짜 계정 검사는 OAuth를 대체하지 않는다.
- Vercel web/admin Preview와 Production은 같은 `travel-blog` URL·공개 키를 사용하도록 전환해야 한다. 현재 Vercel 환경변수 전환은 미완료다. Preview 로그인도 같은 사용자·membership을 조회하며 쓰기는 운영 데이터를 바꾸므로 반복·파괴적 QA를 금지한다.
- 사진·PDF signed upload→큐→Vercel Function→ready→공개 열람은 백업 후 승인된 테스트 자산으로 제한한다. Storage API 삭제 실패·lease 겹침·다량 재시도는 mock/로컬 격리 backend에서 검증한다. 이 기록의 DB rollback 테스트는 실제 파일 처리 증거가 아니다.
- Preview 보호·noindex·GA 동의/철회·Kakao callback, DB·Storage 복원 훈련과 부모님 실제 작성 테스트를 완료한 뒤 공개를 검토한다.

과거 staging 키는 Git에 없는 `supabase/.env.staging.local`(권한 0600)에 보관했다. 이 파일이나 서버 secret을 커밋하지 않는다. 과거 검증 작업에서는 개발 서버나 로컬 Supabase를 시작하지 않았다. 이 문서의 성공 항목은 2026-10-08의 기록이며 현재 단일 원격 배포 검증으로 재분류하지 않는다.
