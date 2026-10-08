# `travel-blog-staging` 검증 기록

2026-10-08 기준 격리 Supabase 프로젝트 `bnfihijsquvvkneoutie`(서울 리전)를 신규 생성했다. 기존 `travel-blog` 운영 후보 DB는 조회만 했고 reset·테스트 fixture·Edge 변경을 적용하지 않았다. Staging의 사이트 ID와 원본 파일명↔원격 버전 대응표는 [staging-deployment.json](./staging-deployment.json)에 있다.

## 적용 상태

| 대상         | 실제 결과                                                                                                                                                                                                                                                        |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| DB           | 빈 프로젝트에 `supabase/migrations` SQL 33개를 순서대로 적용했다. 사이트 1개, 앱 테이블 19개 모두 RLS 활성, Storage 버킷 4개 모두 private 상태를 확인했다.                                                                                                       |
| API          | 로컬 `supabase/functions/travel-api` 소스를 staging `travel-api` v1로 배포했다. 공개/비회원 action의 내부 인증을 위해 `verify_jwt=false`이며, 보호 action은 함수에서 Auth와 membership을 검사한다.                                                               |
| 환경별 owner | 지정된 owner 이메일을 `owner_bootstrap_targets`에 설정했다. 실제 staging Auth 가입이 아직 없으므로 `site_memberships`는 0개다. 가짜 사용자로 이메일 인증 후 owner 자동 부여를 rollback 검증했다.                                                                 |
| 오류 수집    | staging 전용 `TRAVEL_ERROR_REPORT_KEY`를 Edge secret에 설정했다. 키 없는 수집 403, 키 있는 수집 202와 마스킹된 DB 이벤트 저장을 확인했다. 일회용 실제 Auth JWT로 admin 목록·상세 200, editor 403, 권한 회수 후 403을 확인하고 테스트 계정·membership을 삭제했다. |
| 미디어 권한  | `process_asset`만 claim, 만료된 삭제 lease 재획득, 참조 재검사·격리, anon/authenticated의 내부 RPC 거절을 rollback SQL로 검증했다. 실제 Storage 객체의 변환·삭제 실패 재시도는 Vercel Preview 종단 검사로 남겼다.                                                |

`initial_owner.sql`, `auth_revocation.sql`, `api.sql`, `constraints.sql`, `home_covers.sql`, `error_context.sql`, `media_serverless_claim_retry.sql`의 단일 세션 rollback 테스트가 통과했다. `home_covers.sql`에서 PL/pgSQL 변수와 컬럼의 `photo_id` 이름 충돌을 발견해 컬럼 별칭을 명시한 뒤 재실행했다. `node --test supabase/tests/http_test.ts`의 공개 조회·무인증 거절·방문자 토큰 3개도 통과했다. 이 HTTP 검사는 staging ref가 코드에 고정되어 있고 방문자/rate-limit 행을 생성한다.

보안 Advisor는 [RLS 정책 없음 안내](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy) 1건을 표시했다. 대상은 비공개 `app_private.owner_bootstrap_targets`로, RLS와 접근권한 회수를 적용하고 클라이언트 정책은 의도적으로 만들지 않았다. 성능 Advisor의 미사용 인덱스 안내 29건은 데이터가 거의 없는 신규 staging의 관측값이다.

## 마이그레이션 이력 주의

MCP `apply_migration`이 33개 중 32개에 로컬 파일명과 다른 원격 버전을 기록했다. SQL 본문과 적용 순서는 확인했지만 버전 이력이 달라 **이 staging에는 `supabase db push`를 실행하지 않는다.** 직접 SQL로 이력을 고치려는 시도는 자동 승인 심사에서 거절됐고 중단했다. 향후 자동 배포 전에는 [Supabase의 공식 migration repair 절차](https://supabase.com/docs/reference/cli/supabase-migration-repair)를 기준으로 원본 버전과 원격 기록을 검토·승인받아 정합화해야 한다. 그 전의 추가 schema 변경은 원본 SQL과 staging 적용 버전을 별도로 기록한다.

## 아직 필요한 확인

- Staging Kakao provider와 고정 Preview callback 설정 후 실제 지정 owner의 앱 Auth 가입·이메일 인증·membership 및 web/admin 로그아웃을 확인한다. SQL 가짜 계정 검사는 OAuth를 대체하지 않는다.
- Vercel web/admin Preview를 staging URL과 공개 키에만 연결한다. 보호된 admin Function에는 staging 서버 secret, Cron secret, 오류 수집 키를 서버 변수로 둔다.
- 실제 사진·PDF의 signed upload→큐→Vercel Function→ready→공개 열람, Storage API 삭제 실패·재시도, lease 겹침을 시험한다. 이 기록의 DB rollback 테스트는 실제 파일 처리 증거가 아니다.
- Preview 권한·noindex·GA 동의/철회·Kakao callback, 복원 훈련과 부모님 실제 작성 테스트를 완료한 뒤 운영 배포를 검토한다.

Staging 키는 Git에 없는 `supabase/.env.staging.local`(권한 0600)에 보관했다. 이 파일이나 서버 secret을 커밋하지 않는다. 이 작업에서는 개발 서버나 로컬 Supabase를 시작하지 않았다.
