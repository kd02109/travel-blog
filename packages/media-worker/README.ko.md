# 미디어 처리 worker

`@repo/media-worker`는 Supabase Storage의 private 원본을 읽고 이미지 JPEG 파생본 또는 PDF 원본과 첫 페이지 표지를 만든다. 큐와 자산 상태는 Supabase의 `travel_worker`·`travel_media_cleanup` RPC가 관리한다. 파일 삭제는 Storage API를 사용하며 `storage.objects`를 직접 삭제하지 않는다. 현재 결정된 정책은 web/admin의 실제 연결·Vercel Preview·Production을 단일 `travel-blog` 원격 DB로 전환하는 것이다. Vercel 환경변수 변경은 아직 완료되지 않았다.

## 두 실행 방식

- `src/processor.ts`의 `createMediaWorkerFromEnv().runTick()`은 큐에서 자산 처리 작업 하나를 먼저 claim한다. 대기 중인 자산 작업이 없으면 정리 작업 하나를 시도하고 종료한다. Vercel의 관리자 앱 `GET /api/internal/media-worker`가 이 함수를 호출한다.
- `src/worker.ts`는 같은 처리 함수를 반복 호출하는 로컬·Docker용 polling 실행기다. 개발과 Vercel 전환 실패 시 fallback으로 남긴다. Preview와 Production도 같은 `travel-blog` 큐를 보므로 **Docker polling·Preview 수동 호출·Production Cron을 동시에 운영하지 않는다.** DB lease가 중복 claim을 제한해도 처리량·비용·장애 분석이 불필요하게 복잡해진다.

Vercel 경로는 32자 이상 `CRON_SECRET`의 `Authorization: Bearer`를 검증한 뒤, `TRAVEL_MEDIA_WORKER_ENABLED=true`일 때만 실행한다. `SUPABASE_URL`과 `SUPABASE_SERVICE_ROLE_KEY`는 관리자 Vercel 프로젝트의 서버 전용 환경변수다. 브라우저, `NEXT_PUBLIC_` 변수, Git에 넣지 않는다. `sb_secret_...` 키는 JWT가 아니므로 `apikey` 헤더로만 전송한다.

`apps/admin/vercel.mjs`는 기본적으로 Cron을 등록하지 않는다. 빌드 시 `TRAVEL_MEDIA_CRON_ENABLED=true`를 지정한 production deployment에서만 매분 Cron을 요청한다. 이 주기는 [Vercel Pro 이상](https://vercel.com/docs/cron-jobs/usage-and-pricing)이 필요하며, flag 변경은 새 배포가 필요하다. Preview의 `TRAVEL_MEDIA_WORKER_ENABLED`는 기본적으로 `false`다. 보호된 경로를 직접 호출하면 운영 큐를 소비할 수 있으므로 백업·대상 작업·다른 실행기 중지를 확인한 제한된 canary에서만 켠다. Function의 `maxDuration`은 240초이고 DB 작업 lease는 5분이다. native `sharp`·`@napi-rs/canvas`·`pdfjs-dist`의 실제 Linux 번들 및 20MB 파일 처리는 Vercel Preview에서 별도로 확인해야 한다.

## 로컬·Docker 실행

필수 환경변수는 `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`다. 로컬 Docker 환경 파일은 `packages/media-worker/.env.local`에 두며 빌드 컨텍스트에서 제외하고 컨테이너 **실행 시에만** 전달한다.

```sh
# 저장소 루트에서 실행
pnpm media:worker:once
pnpm media:worker
pnpm media:worker:docker:build
pnpm media:worker:docker:run
```

패키지 디렉터리에서는 `pnpm process:once`, `pnpm start`, `pnpm docker:build`, `pnpm docker:run`을 사용한다. polling은 빈 큐에서 5초, 연결 오류에서 15초 쉬고 다시 조회한다. DB는 5분 lease·만료 lease 회수·최대 5회 지수 backoff를 담당한다. 파일은 20MB, 이미지 디코딩은 40MP, PDF는 200쪽으로 제한하며 네트워크 요청은 30초에 timeout한다. 컨테이너 설정의 memory 상한은 512MB다.

`pnpm media:worker`와 `pnpm media:worker:once`는 셸 환경변수를 사용하며 패키지의 `.env.local`을 자동으로 읽지 않는다. 해당 파일을 사용해 Node 실행기를 직접 시험하려면 패키지 디렉터리에서 `MEDIA_WORKER_ONCE=1 node --env-file=.env.local --experimental-strip-types src/worker.ts`를 실행한다. 이 명령이 `travel-blog`를 가리키면 **실제 운영 큐를 소비한다.** 반복·실패·삭제 재시도는 mock/로컬 격리 backend에서 검증한다. 단일 원격에서 필요한 canary는 백업·명시적 테스트 자산·다른 실행기 중지를 확인한 뒤 한 번만 수행한다. Vercel 경로와 같은 동작을 검증하려면 별도 Node polling 대신 관리자 Function을 localhost에서 수동 호출한다. [로컬 검증 절차](../../docs/media-worker-vercel-supabase.ko.md#localhost에서-검증할-때)를 참고한다.

로그에는 job/asset ID, 작업 종류, 시도 횟수와 오류 코드만 남긴다. 파일명, JWT, 업로드 본문, service key는 기록하지 않는다. polling 실행기는 매분 `travel_queue_health`를 읽어 적체·실패·만료 lease를 기록하고, 매시간 정리 후보 수를 보고한다. Vercel 단일 요청 경로는 이 주기 보고를 자동 수행하지 않으므로 운영 지표·알림은 별도로 연결해야 한다.

## 정리와 접근

정리 후보는 24시간 지난 미완료 업로드, 30일 지난 실패 파일, 180일 이상 지난 ready 파일이다. 발행·초안·revision·profile·홈 설정·PDF 표지 참조와 진행 중인 작업이 있으면 제외한다. DB가 대상을 7일 격리하고 새 참조를 막은 뒤, worker가 Storage API로 파일을 지운다. `cleanup_finalize`는 참조를 다시 검사한다. 삭제 실패·Function 중단 후 만료된 `deleting` lease를 다시 claim하려면 `20261008013658_media_serverless_claim_retry.sql` migration이 필요하다. 이 migration은 `travel-blog` 원격에 적용됐지만, 실제 파일·Storage 삭제 종단 검증은 아직 남아 있다. 파괴적 삭제 실패 시험을 이 원격 DB에서 수행하지 않는다.

`asset.access` signed URL의 유효기간은 300초다. 화면은 만료 전에 API에서 새 URL을 요청한다. URL 발급 뒤 글을 비공개로 바꿔도 이미 발급한 URL은 만료 때까지 접근 가능하므로 URL을 로그나 영구 저장소에 남기지 않는다.

전체 환경별 배포·검증·롤백 순서는 [미디어 worker Vercel·Supabase 전환 가이드](../../docs/media-worker-vercel-supabase.ko.md)를 따른다.
