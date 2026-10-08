# 여행 블로그 Supabase 운영 현황

기준일: 2026-10-08. 단일 원격 Supabase 프로젝트 `travel-blog`를 로컬 실제 연결과 Vercel Preview·Production의 web/admin에 사용하도록 전환한다. Vercel 환경변수 전환은 아직 완료되지 않았다. DB migration, Edge Function, Vercel 앱/미디어 실행기는 **별도로 배포**한다. [배포 식별자](./deployment.json)의 읽기 전용 원격 대조는 실제 OAuth·미디어·Vercel 종단 검증 완료를 뜻하지 않는다.

| 용도                       | 프로젝트                                                                                              | 확인된 상태                                                                                                                                                                                                                           |
| -------------------------- | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 단일 원격 `travel-blog`    | `kqbqoopqomrwozpqgono` · [Supabase 콘솔](https://supabase.com/dashboard/project/kqbqoopqomrwozpqgono) | migration 33개가 `20261008013658_media_serverless_claim_retry`까지 적용됨. `travel-api`는 v19. DB와 Edge의 버전은 서로 다르며, v19에는 로컬의 `error.capture`/`admin.errors` 코드가 아직 배포되지 않았다. DB를 reset하지 않는다. |
| 과거 검증 `travel-blog-staging` | `bnfihijsquvvkneoutie` · [Supabase 콘솔](https://supabase.com/dashboard/project/bnfihijsquvvkneoutie) | 33개 migration 순차 적용과 `travel-api` v3 배포, SQL·HTTP 권한 및 localhost CORS 검사는 과거 검증 결과다. 현재 Vercel 연결·신규 릴리스의 활성 배포 대상이 아니다. 보존 여부는 별도 결정한다. |

운영 사이트는 slug `parents-travel`, ID `e6bac53e-3c68-49dd-9784-f3c413603ef2`다. 과거 staging 사이트 ID와 migration 버전 대응표는 [staging 배포 기록](./staging-deployment.json)에 보존했다. [과거 staging 검증 기록](./STAGING.ko.md), [API 사용 명세](./API.ko.md), [DB 타입](./database.types.ts), [미디어 배포 절차](../docs/media-worker-vercel-supabase.ko.md)를 함께 참고한다.

## DB와 최초 owner

현재 migration은 사이트와 membership, 글·수정 이력·발행, 댓글·좋아요, 비공개 미디어와 작업 큐, 오류 이슈·이벤트를 구성한다. `public`의 앱 테이블과 `app_private` 테이블에는 RLS를 적용하고 `anon`/`authenticated`의 원본 테이블 직접 접근을 차단한다. 네 Storage 버킷은 모두 private이며, 공개 승인 파일도 `travel-api`가 접근을 검사한 뒤 signed URL을 발급한다. 이미 발급된 URL은 만료 전까지 유효할 수 있다.

초기 migration의 `owner@example.invalid`는 비활성 예시 주소다. 실제 최초 owner는 `app_private.owner_bootstrap_targets`에 지정한다. 과거 staging DB에 운영 owner 대상이나 membership을 자동 복제하지 않았으며, 앞으로도 다른 프로젝트를 만들 때 자동 복제하지 않는다. Supabase 콘솔 계정과 앱의 `auth.users` 계정은 별개다. 대상 지정 후 해당 앱 계정의 이메일 인증과 활성 `site_memberships.role='owner'`를 확인한다. 미인증 가입과 사용자가 수정할 수 있는 metadata만으로 권한을 주지 않는다.

과거 staging에는 지정된 owner 대상을 설정했지만 실제 앱 Auth 가입이 없어 활성 membership은 없었다. `tests/initial_owner.sql`의 가짜 계정·rollback 검사는 통과했다. 이 검사는 실제 카카오 OAuth 로그인과 JWT 검증을 대신하지 않는다. 단일 원격 DB에는 테스트 fixture를 실행하지 않는다.

## API와 오류 관측

브라우저와 서버 앱은 `travel-api` Edge Function을 호출한다. Supabase REST 테이블이나 내부 `travel_api`·`travel_worker` RPC를 브라우저에서 직접 호출하지 않는다. `verify_jwt=false`는 공개 조회·비회원 기능을 위한 설정이며, 보호된 action은 Edge 내부에서 Auth `getUser(access_token)`을 수행하고 DB에서 활성 membership을 재검사한다. `SUPABASE_SERVICE_ROLE_KEY`는 Edge/보호된 서버 환경에만 둔다.

로컬 Edge 소스의 `TRAVEL_API_ALLOWED_ORIGINS`는 web/admin의 정확한 `https://` 출처를 쉼표로 구분한다. 과거 staging에는 localhost·127.0.0.1의 3000·3002만 등록해 제한을 검증했다. 그러나 현재 `travel-blog` Edge v19는 아직 `Access-Control-Allow-Origin: *`를 반환한다. 단일 원격에 최신 Edge를 배포할 때 localhost와 고정 Preview·운영 web/admin 출처를 **같은 프로젝트의** secret에 정확히 등록하고 preflight·POST·미허용 Origin 403을 재검증해야 한다. Origin 없는 서버 간 요청은 계속 허용된다. Origin 검사는 JWT·membership·CSRF 검증의 대체가 아니다.

오류 관측용 SQL migration 3개는 `travel-blog`에 적용됐지만, 해당 수집·관리자 조회 코드를 포함한 Edge 버전은 아직 배포되지 않았다. 과거 staging에서는 별도 `TRAVEL_ERROR_REPORT_KEY`로 수집 202/무키 403, 관리자 조회 200, editor·권한 회수자 조회 403, 마스킹 SQL 검사를 통과했다. 단일 원격 사용 시 전환 후 Preview/Production 서버 릴레이와 Edge의 키 구성이 일치해야 하며 브라우저에 노출해서는 안 된다. Preview 오류 이벤트도 같은 운영 오류 테이블에 들어가므로 `NEXT_PUBLIC_DEPLOY_ENV`와 release로 구분한다.

## 미디어 처리 실행기

`asset.complete`는 업로드된 파일의 크기·형식·checksum을 검사하고 작업을 큐에 넣는다. 이 응답이 변환 완료나 게시 가능 상태를 뜻하지 않는다. 이미지는 Sharp, PDF 첫 장은 PDF.js/Canvas로 처리하며, 실제 변환과 결과 업로드가 끝나야 `ready`가 된다. Storage 객체 삭제는 SQL로 `storage.objects`를 직접 지우지 않고 Storage API를 사용한다.

현재 코드의 권장 배포 경로는 **Vercel Cron → 보호된 `apps/admin` Node Function → `@repo/media-worker`의 한 번에 최대 한 작업 처리**다. `CRON_SECRET`, `TRAVEL_MEDIA_WORKER_ENABLED`, 단일 `travel-blog`의 `SUPABASE_URL`·서버 전용 service key가 필요하다. 매분 Cron 등록은 production 빌드의 `TRAVEL_MEDIA_CRON_ENABLED=true`로 명시적으로 켜며 기본값은 꺼짐이다. Preview와 Production의 Worker Function이 같은 큐를 보므로 Preview의 worker flag는 기본적으로 끄고, 실제 작업을 소비하는 시험은 백업·대상·중복 실행기를 확인한 제한된 canary로만 한다. Docker polling 실행기는 fallback으로 남아 있다. 같은 DB 큐에 Vercel Function과 Docker를 동시에 활성화하지 않는다. 운영 DB의 claim·lease 보정 migration은 적용됐지만, Vercel Function/Cron의 운영 배포와 실제 Storage 파일 종단 검증은 아직 완료되지 않았다. [상세 실행·전환 절차](../docs/media-worker-vercel-supabase.ko.md)를 따른다.

## 재현과 남은 검증

`supabase/deployment.json`은 **단일 원격 프로젝트의 스냅샷**이다. 과거 staging은 [별도 기록](./staging-deployment.json)에 33개 원본 파일명과 실제 기록된 버전을 남겼다. MCP가 32개 migration에 새 버전을 기록했으므로 이력 정합성을 승인된 방법으로 복구하기 전에는 해당 과거 프로젝트에 Supabase CLI `db push`를 실행하지 않는다. 현재 릴리스는 `travel-blog-staging`을 대상으로 하지 않는다.

로컬 Edge 단위 검사는 다음 명령으로 실행한다.

```sh
npx deno check --config supabase/functions/travel-api/deno.json supabase/functions/travel-api/index.ts
npx deno test --config supabase/functions/travel-api/deno.json supabase/functions/travel-api/core_test.ts
```

`supabase/tests/*.sql`은 로컬 Supabase 또는 별도 격리 테스트 DB에서 `BEGIN`부터 `ROLLBACK`까지 한 DB 세션으로 실행한다. `BEGIN`과 `ROLLBACK`을 서로 다른 SQL 호출로 나누지 않는다. 아래의 원격 SQL·HTTP 결과는 **과거 staging 검증 기록**이며, 운영 `travel-blog`에 대상 ref를 바꿔 재실행하지 않는다. 권한·RLS SQL 테스트와 실제 Auth 토큰을 쓰는 HTTP 테스트는 모두 필요하다.

당시의 `pnpm test:staging:api` 명령으로 staging `travel-api` HTTP 4개 검사를 실행했다. 이 검사는 방문자·rate-limit 기록을 생성하므로 **단일 `travel-blog` 프로젝트를 대상으로 실행하지 않는다.** 현재 명령 `pnpm test:api:local`은 로컬/격리 backend를 대상으로 사용한다. 2026-10-08 기준 공개 조회·무인증 거절·방문자 토큰·CORS가 과거 staging에서 통과했다.

남은 출시 검증은 로컬/격리 backend에서 권한 회수·파일 삭제 실패·lease 재시도를 수행하고, 단일 원격에서는 실제 owner·admin·비회원 로그인과 제한된 사진·PDF canary, Vercel Preview 두 앱 연결 및 운영 Function/Cron 호출을 확인하는 것이다. Mock/로컬 결과는 원격 Kakao·Storage·native 변환 증거가 아니다. 운영 변경 전에는 [Supabase 백업 문서](https://supabase.com/docs/guides/platform/backups)를 따라 DB 덤프와 Storage 복구 방안을 마련한다. Free 플랜에는 자동 일일 DB 백업이 제공되지 않는다.

공식 참고: [Edge 인증](https://supabase.com/docs/guides/functions/auth), [API 보호](https://supabase.com/docs/guides/api/securing-your-api), [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security).
