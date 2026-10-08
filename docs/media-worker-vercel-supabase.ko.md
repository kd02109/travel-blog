# 미디어 worker의 Vercel·Supabase 전환

기준일: 2026-10-08. 이 문서는 로컬 구현과 원격 배포 상태를 구분한다. 코드에는 Supabase 큐를 한 번만 처리하는 `@repo/media-worker` 함수, 보호된 관리자 Next.js Function, 1분 Vercel Cron 설정과 큐/삭제 lease 보정 migration이 있다. worker 단위 테스트 8개, route 테스트 5개, 타입 검사와 PostgreSQL 17의 관련 스키마·pgtap shim을 이용한 격리 SQL 테스트는 통과했다. 작은 테스트 이미지는 실제 `sharp` 변환·업로드 요청까지 검사했다. 관리자 Function의 선택 경로 webpack 프로덕션 빌드와 로컬 빌드 실행도 통과했다. 가짜 Supabase API를 연결한 로컬 호출에서 인증 없는 요청 401, 이미지·PDF 처리 각각 200 `processed`, 빈 큐 200 `idle`을 확인하고 테스트 서버를 종료했다. **연결된 Supabase `travel-blog`에는 새 migration까지 적용됐지만, Vercel에서 이 프로젝트의 web/admin 프로젝트를 찾지 못해 Function과 Cron은 배포되지 않았다.** 전체 staging migration 재생, 실제 Storage API 삭제, 실물 고화질 이미지/PDF 처리, 비용과 처리량은 격리 staging 및 Vercel Preview에서 아직 확인해야 한다.

## 목표 구조와 이유

```text
브라우저 ─ signed upload ─→ Supabase private Storage
   │                              │
   └─ asset.complete ─→ travel-api ─→ Postgres outbox_jobs
                                        │
Vercel Cron ─ Bearer CRON_SECRET ─→ apps/admin Node Function
                                        │ 한 요청에 최대 한 작업
                                        ▼
                              @repo/media-worker/processor
                                  ├─ travel_worker / travel_media_cleanup RPC
                                  ├─ Storage 원본 읽기·파생본 업로드
                                  └─ complete / fail / cleanup_finalize RPC
```

브라우저 파일은 Vercel Function을 거치지 않고 기존 signed upload 경로를 유지한다. 변환에는 `sharp`, `pdfjs-dist`, `@napi-rs/canvas`가 필요하므로 Vercel Node Function을 쓴다. [Supabase Edge Function의 CPU·메모리 한도](https://supabase.com/docs/guides/functions/limits)를 고려하면 Edge에서 같은 native 이미지/PDF 처리를 검증 없이 대체하지 않는다.

`packages/media-worker/src/processor.ts`는 환경변수나 루프를 import 시 실행하지 않고 `runTick()`으로 자산 작업 하나를 먼저 claim한다. 자산 큐가 비었을 때에만 정리 작업 하나를 시도한다. `packages/media-worker/src/worker.ts`의 Docker/로컬 polling은 fallback으로 유지한다. `apps/admin/app/api/internal/media-worker/route.ts`는 `Authorization: Bearer <CRON_SECRET>`을 일정한 시간 비교로 검사하며, secret 길이 32자 미만·누락·오류면 401, 기능 flag가 꺼지면 503을 반환한다. 인증 후에만 native 처리 모듈을 로드한다. Function 응답은 캐시하지 않는다. Function `maxDuration=240`초는 Supabase 작업 lease 5분보다 짧게 둔 값이다. 변환 파일 경로는 시도 횟수별로 달라 재시도 때 기존 결과를 덮어쓰지 않는다.

새 `20261008013658_media_serverless_claim_retry.sql`은 `travel_worker('claim')`이 `process_asset`만 가져오게 하고, Storage 삭제 도중 중단된 자산의 만료 `deleting` lease를 재획득하도록 한다. 참조·작업·PDF 표지 상태를 다시 검사하고 Storage API 삭제 후 `cleanup_finalize`가 최종 확인한다. 이 migration 없이 Function을 켜면 다른 outbox 작업을 잘못 claim하거나 삭제 실패를 영구 정체시킬 수 있다. 기존 outbox의 `invalidate_cache` 같은 **다른 종류의 작업은 이 worker의 범위 밖**이며, 그 작업의 처리·적체는 별도로 확인해야 한다.

## 실제 프로젝트 상태

| 항목 | 확인 결과 | 배포 시 해야 할 일 |
| --- | --- | --- |
| Supabase `travel-blog` | `kqbqoopqomrwozpqgono`, Seoul, migration 33개가 `20261008013658`까지 적용, `travel-api` Edge v19 | 기존 DB reset 금지. 현재 로컬 Edge 변경은 staging에 먼저 배포·검증 |
| 원격 미디어 큐 | 이전 확인에서 `process_asset` 완료 14·실패 3, 만료된 `invalidate_cache` lease 10 | 미디어 작업과 비미디어 적체를 분리해 진단하고 실제 업로드 테스트 |
| Vercel | 연결된 계정에서 `travel-blog` web/admin 프로젝트가 보이지 않음 | 저장소를 별도 web/admin 프로젝트에 연결; admin Root Directory `apps/admin` 확인 |
| 현재 실행기 | 로컬 코드에 Docker polling과 Vercel 1회 처리 경로가 공존 | 같은 Supabase 환경에서 동시 활성화 금지; production 전환을 단계별로 수행 |

Supabase migration/Edge 배포는 Vercel Git 자동 배포에 포함되지 않는다. DB 버전과 `travel-api` 버전을 별도 릴리스 절차로 관리한다. `supabase/deployment.json`은 2026-10-08 읽기 전용 원격 대조 결과를 기록하며, 다음 배포 전에는 원격 이력을 다시 확인한다.

## localhost에서 검증할 때

별도 로컬 worker 구현은 필요 없다. 관리자 Next.js 개발 서버에서도 같은 `GET /api/internal/media-worker`가 실행된다. 다만 Vercel Cron은 로컬에서 자동 호출되지 않으므로 요청을 직접 한 번씩 보내야 한다. 호출 한 번은 **실제 큐 작업 최대 한 건을 소비하거나 삭제 후보를 처리**한다.

1. 현재 연결된 `travel-blog`에는 새 미디어 claim migration이 적용됐지만, 보호된 route의 실제 파일·Storage 삭제 흐름은 검증되지 않았다. 먼저 **격리된 staging Supabase**에 모든 migration과 `travel-api`를 순서대로 적용하고 실제 Storage/권한을 검증한다. 401/기능 flag 503 검사와 가짜 backend 테스트는 기존 DB를 소비하지 않는다.
2. `apps/admin/.env.supabase.local`(Git 제외)에 staging의 `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, 같은 프로젝트의 서버 전용 `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, 32자 이상 `CRON_SECRET`, `TRAVEL_MEDIA_WORKER_ENABLED=true`를 둔다. 루트 `.env.supabase.local`이 다른 프로젝트를 가리키면 관리자 앱 파일의 공개 URL/key도 staging 값으로 덮어쓴다. 셸 환경변수는 두 파일보다 우선하므로 실행 전에 오래된 Supabase URL/key가 남아 있지 않은지 확인한다. worker 패키지의 `.env.local`은 관리자 Next.js가 읽지 않는다.
3. `pnpm --filter admin dev:supabase`를 실행하고, 다른 터미널에서 아래처럼 **비밀값을 명령줄에 직접 적지 않고** 보호된 route를 한 번 호출한다. 결과가 `processed`면 자산의 ready 상태·파생 파일·PDF 표지를 확인한다. 이 경로를 시험하는 동안 같은 staging 큐의 Docker polling은 켜지 않는다.

```sh
node --env-file=apps/admin/.env.supabase.local --input-type=module -e 'const response = await fetch("http://localhost:3002/api/internal/media-worker", { headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` } }); console.log(response.status, await response.text());'
```

완전히 로컬인 Supabase CLI(`http://127.0.0.1:54321`)는 현재 `scripts/environment.mjs`의 SaaS HTTPS URL 검사로 관리자 `dev:supabase`에서 거절된다. 이 방식까지 필요하면 localhost 전용 실행 프로필, migration 전체 재생, 로컬 `travel-api`·Storage·Auth/owner 초기화를 별도로 마련해야 한다. 기존 원격 SaaS 검사 규칙을 느슨하게 바꿔 모든 HTTP 주소를 허용하지 않는다. [Vercel Cron 로컬 호출](https://vercel.com/docs/cron-jobs/manage-cron-jobs), [Supabase 로컬 개발](https://supabase.com/docs/guides/local-development).

## Vercel 관리자 프로젝트 설정

1. 원격 Git 저장소를 Vercel에 연결하고 admin 프로젝트의 Root Directory를 `apps/admin`으로 지정한다. workspace 루트 lockfile과 공유 `packages/media-worker`를 포함해 설치·빌드되는지 Preview에서 확인한다. admin에는 `sharp`, `pdfjs-dist`, `@napi-rs/canvas`를 서버 런타임 의존성으로 명시했다. 선택 경로 webpack 빌드와 macOS 로컬 실행은 통과했지만, Vercel의 Linux native 바이너리·PDF 글꼴 경로는 Preview에서 실행 확인해야 한다. 기본 Turbopack 빌드는 이 격리 환경에서 CSS loader의 포트 생성 권한 오류로 완료하지 못했다. web은 별도 `apps/web` 프로젝트로 둔다. [Vercel 모노레포 가이드](https://vercel.com/docs/monorepos).
2. `apps/admin/vercel.json`이 `/api/internal/media-worker`를 매분 호출한다. [Vercel Cron은 production deployment에서 실행](https://vercel.com/docs/cron-jobs)되므로 Preview는 직접 요청으로 검사한다. **매분 실행은 Vercel Pro 이상이 필요하다.** Hobby의 1일 1회 주기로는 업로드 후 빠른 처리와 정리 지연 목표를 충족하기 어렵다. [Cron 주기·요금](https://vercel.com/docs/cron-jobs/usage-and-pricing).
3. 관리자 프로젝트의 server-only 환경변수를 환경별로 설정한다. 변수 이름은 `apps/admin/.env.example`에도 있다. Preview에는 격리 staging Supabase 값을, Production에는 운영 Supabase 값을 넣는다. 설정 변경 후 대상 deployment가 새 값을 받는지 확인한다.

| 변수 | Preview | Production | 주의 |
| --- | --- | --- | --- |
| `SUPABASE_URL` | staging project URL | 운영 project URL | `NEXT_PUBLIC_SUPABASE_URL`과 별개로 worker 서버에서 사용 |
| `SUPABASE_SERVICE_ROLE_KEY` | staging secret/service-role key | 운영 secret/service-role key | `sb_secret_...` 또는 기존 service_role JWT; 브라우저·로그·Git 금지 |
| `CRON_SECRET` | 독립된 긴 난수 | 별도 긴 난수 | 최소 32자; Vercel Cron의 Bearer 헤더와 route 검증값을 일치시킴 |
| `TRAVEL_MEDIA_WORKER_ENABLED` | Preview 직접 테스트할 때 `true` | canary 준비 후 `true` | `false`면 보호된 route가 503; Cron 설정 자체를 없애지는 않음 |

`CRON_SECRET`과 Supabase secret을 같은 값으로 재사용하지 않는다. secret은 Vercel의 환경변수 UI/비밀 저장소로 관리하고 `NEXT_PUBLIC_` 접두사를 붙이지 않는다. Secret 권한이 있는 관리자만 변경한다. Function 로그에는 job/asset ID와 정해진 오류 코드만 남기고 파일명, 원본 파일, 토큰, secret을 기록하지 않는다. [Vercel Cron 보안](https://vercel.com/docs/cron-jobs/manage-cron-jobs).

Function이 1분에 최대 한 작업만 처리하므로 지속 유입이 1건/분을 넘으면 적체될 수 있다. 자산 작업이 계속 있으면 정리 작업도 밀린다. 실측한 최대 업로드량·처리시간·정리 후보를 기준으로 스케줄 또는 안전한 다중 처리 방식을 다시 설계해야 한다. Cron 전달을 정확히 한 번 보장으로 간주하지 않고 DB lease·시도 횟수·중복 처리 방어를 유지한다.

## 적용 및 검증 순서

1. **격리 DB:** 빈 로컬/격리 staging에 전체 migration을 순서대로 적용하고 `supabase/tests/media_serverless_claim_retry.sql`을 실행한다. `process_asset`만 claim되는지, 삭제 실패→5분 lease 만료→재획득, 참조 중 삭제 차단, PDF 표지 쌍, service-role 권한을 확인한다. 운영 DB reset은 하지 않는다. 기존 원격 migration 이력과 파일을 대조한 뒤 승인된 migration 배포 절차로 새 migration을 반영한다.
2. **staging backend:** staging의 `travel-api`, private Storage bucket, Auth/owner를 준비한다. 실제 signed upload→`asset.complete`→outbox 생성까지 확인한다. `storage.objects` 행을 SQL로 직접 삭제해 성공을 만들지 않는다.
3. **Vercel Preview:** native 패키지가 Linux에 포함되는지 빌드와 실행으로 확인한다. `CRON_SECRET` 없이/잘못 보내면 401, 기능 flag가 꺼지면 503, 올바른 Bearer와 flag로 빈 큐이면 200과 `idle` 응답이어야 한다. 직접 호출은 실제 큐를 소비하므로 격리 staging에서만 수행한다. 예시: `curl -i -H "Authorization: Bearer ${CRON_SECRET}" "${PREVIEW_URL}/api/internal/media-worker"`.
4. **실제 파일:** 일반·고화질 이미지와 20MB 이하 PDF로 ready/표지/공개 열람을 확인하고, 20MB 초과·40MP 초과·손상/암호화 PDF·200쪽 초과는 거절되는지 확인한다. `sharp`/Canvas 번들, 함수 메모리·실행시간·Storage 전송량, 처리 대기시간을 측정한다. 함수 중단·30초 네트워크 실패·재호출·겹친 호출·5분 lease 만료·최대 5회 backoff를 반복한다. 7일 격리 후 참조 중/미참조/Storage API 삭제 실패·부분 삭제·재시도를 검증한다.
5. **운영 canary:** migration → 호환되는 API → admin Function/Cron 순으로 배포한다. 운영 Docker polling을 중지했음을 확인한 뒤 제한된 테스트 자산을 만들고 Vercel Cron의 실제 호출·ready/실패·적체를 본다. Preview의 성공은 production Cron 전달 성공을 뜻하지 않는다. Docker와 Cron을 같은 production 큐에서 함께 켜지 않는다.

관찰 기준은 미디어 `process_asset`의 queued/running/failed 수, 가장 오래된 queued 시간, 만료 lease, `media_worker_tick_failed`·`media_job_failed`, Function 시간·메모리·비용, Storage 오류율이다. 기존 `travel_queue_health`는 다른 outbox 종류를 포함할 수 있으므로 경고를 원인 작업 종류별로 확인한다. 완료 기준은 staging에서 실제 이미지/PDF와 삭제 재시도까지 통과하고, 운영 Cron canary가 일정 기간 작업을 정상 완료하는 것이다.

## 중지와 복구

Cron 또는 native Function에 장애가 나면 admin Vercel 프로젝트의 Cron 호출을 중지하거나 Cron 없는 배포를 적용하고, Function의 `TRAVEL_MEDIA_WORKER_ENABLED`를 끈 deployment가 반영됐는지 확인한다. 실행 중이던 lease가 만료되고 새 claim이 멈춘 것을 확인한 뒤 **한 실행기만** Docker polling fallback으로 시작한다. 서비스 키가 노출됐다면 Supabase 키를 회전하고 Vercel·Docker의 값을 함께 갱신한다.

새 migration은 큐 claim 범위와 삭제 lease 재획득을 보정하는 호환성 변경이다. 이미 처리한 Storage 객체와 DB 상태가 있으므로 실패 시 운영 DB를 reset하거나 migration을 무작정 역적용하지 않는다. 중단 시점의 job/asset ID, lease, Storage 경로, Function release와 migration 버전을 기록하고 필요한 경우 앞으로 수정하는 migration을 만든다. [Vercel Function 실행 제한](https://vercel.com/docs/functions/configuring-functions/duration), [Vercel Cron 운영](https://vercel.com/docs/cron-jobs/manage-cron-jobs).
