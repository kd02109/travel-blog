# 여행 블로그 Supabase 운영 현황

기준일: 2026-10-08. DB migration, Edge Function, Vercel 앱/미디어 실행기는 **별도로 배포**한다. 이 문서의 운영 상태는 [배포 식별자](./deployment.json)의 읽기 전용 원격 대조 결과를 기준으로 하며, staging과 Vercel의 종단 검증 완료를 뜻하지 않는다.

| 환경                       | 프로젝트                                                                                              | 확인된 상태                                                                                                                                                                                                                           |
| -------------------------- | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 기존 `travel-blog`         | `kqbqoopqomrwozpqgono` · [Supabase 콘솔](https://supabase.com/dashboard/project/kqbqoopqomrwozpqgono) | migration 33개가 `20261008013658_media_serverless_claim_retry`까지 적용됨. `travel-api`는 v19. DB와 Edge의 버전은 서로 다르며, v19에는 로컬의 `error.capture`/`admin.errors` 코드가 아직 배포되지 않았다. 기존 DB를 reset하지 않는다. |
| 격리 `travel-blog-staging` | `bnfihijsquvvkneoutie` · [Supabase 콘솔](https://supabase.com/dashboard/project/bnfihijsquvvkneoutie) | 33개 migration 순차 적용과 `travel-api` v1 배포 완료. SQL·HTTP 권한 검사는 통과했으며, 실제 카카오 owner 로그인·파일 변환·Vercel Preview는 미완료다.                                                                                  |

운영 사이트는 slug `parents-travel`, ID `e6bac53e-3c68-49dd-9784-f3c413603ef2`다. Staging 사이트 ID와 migration 버전 대응표는 [staging 배포 기록](./staging-deployment.json)에 분리했다. API action은 [Edge Function 코드](./functions/travel-api/core.ts), 미디어 실행은 [worker README](../packages/media-worker/README.ko.md), DB 구조는 [타입 파일](./database.types.ts)을 참고한다. 상세 검증·배포 기록은 로컬에 보관한다.

## DB와 최초 owner

현재 migration은 사이트와 membership, 글·수정 이력·발행, 댓글·좋아요, 비공개 미디어와 작업 큐, 오류 이슈·이벤트를 구성한다. `public`의 앱 테이블과 `app_private` 테이블에는 RLS를 적용하고 `anon`/`authenticated`의 원본 테이블 직접 접근을 차단한다. 네 Storage 버킷은 모두 private이며, 공개 승인 파일도 `travel-api`가 접근을 검사한 뒤 signed URL을 발급한다. 이미 발급된 URL은 만료 전까지 유효할 수 있다.

초기 migration의 `owner@example.invalid`는 비활성 예시 주소다. 실제 최초 owner는 `app_private.owner_bootstrap_targets`에 **환경별로** 지정한다. 새 staging DB에 운영 owner 대상이나 membership을 자동 복제하지 않는다. Supabase 콘솔 계정과 앱의 `auth.users` 계정은 별개다. 대상 지정 후 해당 앱 계정의 이메일 인증과 활성 `site_memberships.role='owner'`를 확인한다. 미인증 가입과 사용자가 수정할 수 있는 metadata만으로 권한을 주지 않는다.

Staging에는 지정된 owner 대상을 설정했지만 실제 앱 Auth 가입이 없어 활성 membership은 아직 없다. `tests/initial_owner.sql`의 가짜 계정·rollback 검사는 통과했다. 이 검사는 실제 카카오 OAuth 로그인과 JWT 검증을 대신하지 않는다. 운영 DB에는 테스트 fixture를 실행하지 않는다.

## API와 오류 관측

브라우저와 서버 앱은 `travel-api` Edge Function을 호출한다. Supabase REST 테이블이나 내부 `travel_api`·`travel_worker` RPC를 브라우저에서 직접 호출하지 않는다. `verify_jwt=false`는 공개 조회·비회원 기능을 위한 설정이며, 보호된 action은 Edge 내부에서 Auth `getUser(access_token)`을 수행하고 DB에서 활성 membership을 재검사한다. `SUPABASE_SERVICE_ROLE_KEY`는 Edge/보호된 서버 환경에만 둔다.

오류 관측용 SQL migration 3개는 기존 `travel-blog`에 적용됐지만, 해당 수집·관리자 조회 코드를 포함한 Edge 버전은 아직 운영에 배포되지 않았다. Staging Edge에는 별도 `TRAVEL_ERROR_REPORT_KEY`를 설정하고 수집 202/무키 403, 관리자 조회 200, editor·권한 회수자 조회 403, 마스킹 SQL 검사를 통과했다. Preview web/admin 서버 릴레이에는 **같은 staging 전용 키**를 서버 변수로 설정해야 하며 브라우저에는 노출하지 않는다.

## 미디어 처리 실행기

`asset.complete`는 업로드된 파일의 크기·형식·checksum을 검사하고 작업을 큐에 넣는다. 이 응답이 변환 완료나 게시 가능 상태를 뜻하지 않는다. 이미지는 Sharp, PDF 첫 장은 PDF.js/Canvas로 처리하며, 실제 변환과 결과 업로드가 끝나야 `ready`가 된다. Storage 객체 삭제는 SQL로 `storage.objects`를 직접 지우지 않고 Storage API를 사용한다.

현재 코드의 권장 배포 경로는 **Vercel Cron → 보호된 `apps/admin` Node Function → `@repo/media-worker`의 한 번에 최대 한 작업 처리**다. `CRON_SECRET`, `TRAVEL_MEDIA_WORKER_ENABLED`, staging/운영별 `SUPABASE_URL`·서버 전용 service key가 필요하다. Docker polling 실행기는 로컬 검증과 fallback으로 남아 있다. 같은 DB 큐에 Vercel Function과 Docker를 동시에 활성화하지 않는다. 운영 DB의 claim·lease 보정 migration은 적용됐지만, Vercel Function/Cron의 운영 배포와 실제 Storage 파일 종단 검증은 아직 완료되지 않았다. 실행 명령과 안전 조건은 [worker README](../packages/media-worker/README.ko.md)에 정리했다.

## 재현과 남은 검증

`supabase/deployment.json`은 **기존 운영 프로젝트의 스냅샷**이다. Staging은 [별도 기록](./staging-deployment.json)에 33개 원본 파일명과 실제 기록된 버전을 모두 남겼다. MCP가 32개 migration에 새 버전을 기록했으므로 이력 정합성을 승인된 방법으로 복구하기 전에는 staging에 Supabase CLI `db push`를 실행하지 않는다.

로컬 Edge 단위 검사는 다음 명령으로 실행한다.

```sh
npx deno check --config supabase/functions/travel-api/deno.json supabase/functions/travel-api/index.ts
npx deno test --config supabase/functions/travel-api/deno.json supabase/functions/travel-api/core_test.ts
```

`supabase/tests/*.sql`은 **격리된 staging**에서 `BEGIN`부터 `ROLLBACK`까지 한 DB 세션으로 실행한다. `BEGIN`과 `ROLLBACK`을 서로 다른 원격 SQL 호출로 나누지 않는다. 임시 테이블·pgTAP 테스트는 명시적 프로젝트 ref로 `supabase db query --linked --project-ref bnfihijsquvvkneoutie --file supabase/tests/<파일>.sql`을 사용했다. 권한·RLS SQL 테스트와 실제 Auth 토큰을 쓰는 HTTP 테스트는 모두 필요하다.

`pnpm test:staging:api`는 staging `travel-api` HTTP 3개 검사를 실행한다. 방문자·rate-limit 기록을 생성하므로 **운영 프로젝트에 바꿔서 실행하지 않는다.** 2026-10-08 기준 3개가 통과했다.

남은 출시 검증은 staging owner·admin·비회원의 실제 로그인/권한 회수, 사진·PDF signed upload→큐→ready→게시, Storage 삭제 실패와 lease 재시도, Vercel Preview 두 앱의 연결 및 Cron 수동 호출이다. 운영의 migration·Edge 버전과 staging 결과를 다시 대조한 뒤 배포한다.

공식 참고: [Edge 인증](https://supabase.com/docs/guides/functions/auth), [API 보호](https://supabase.com/docs/guides/api/securing-your-api), [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security).
