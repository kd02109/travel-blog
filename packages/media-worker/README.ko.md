# 미디어 처리 worker

TypeScript/Node.js worker는 Supabase Storage의 private 원본을 읽고, 이미지 JPEG 파생본 또는 PDF 원본과 첫 페이지 표지를 만든다. 처리/취소는 `public.travel_worker`, 정리는 `public.travel_media_cleanup`을 service role로 호출한다. service role은 브라우저와 Next.js public 환경변수에 넣지 않는다.

## 실행

필수 환경변수는 `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`다. 두 번째 변수에는 기존 `service_role` JWT 또는 새 `sb_secret_...` 키를 사용할 수 있다. 새 secret 키는 JWT가 아니므로 Worker가 `apikey` 헤더로만 보내며, `Authorization: Bearer`에는 사용하지 않는다. Docker 실행용 환경 파일은 `packages/media-worker/.env.local`에 두며, Docker 빌드 컨텍스트에서 제외되고 컨테이너 실행 때만 전달된다.

```sh
# 저장소 루트에서 실행
pnpm media:worker:docker:build
pnpm media:worker:docker:run
남은 나머지 내역도 커밋을 나누어서 진행해줄 수 있을까?
# Docker 없이 로컬 Node.js로 실행할 때
pnpm media:worker
pnpm media:worker:once
```

패키지 디렉터리에서 직접 실행하려면 `pnpm docker:build`, `pnpm docker:run`을 사용한다. 실행 스크립트는 `travel-media-worker` 이미지를 사용하며, 같은 환경 파일을 사용하는 컨테이너를 이미 실행 중이면 Docker가 중복 실행을 거부할 수 있다.

호스트의 컨테이너 스케줄러가 상시 실행과 재시작을 관리하고, worker는 비어 있는 큐에서 5초, 연결 오류에서는 15초 쉬며 다시 조회한다. 작업 claim은 DB의 5분 lease와 `FOR UPDATE SKIP LOCKED`를 사용한다. lease가 만료되면 다음 worker가 회수하고, SQL이 실패를 최대 5회까지 지수 간격으로 재시도한다. 요청은 30초에 timeout한다. 파일은 20MB, 이미지 디코딩은 40MP, PDF는 200쪽으로 제한한다. 런타임 heap은 384MB, 컨테이너 memory는 512MB다.

로그에는 job/asset ID, 파일 종류, 횟수와 오류 코드만 남긴다. 파일명, JWT, 업로드 본문, service key는 기록하지 않는다. 매분 service-role 전용 read-only `travel_queue_health` RPC에서 queued/running/failed 수, lease 만료와 가장 오래된 대기 시간을 읽는다. 실패/만료/대기 작업이 있으면 `media_queue_backlog` 경고 로그를 남긴다. 컨테이너 호스트는 해당 경고를 알림 대상으로 연결해야 한다.

## 정리 정책과 접근

worker는 매시간 cleanup 후보 수를 기록하고, 매 loop에서 정리 RPC를 확인한다. 후보 기준은 24시간 지난 미완료 업로드, 30일 지난 실패 파일, 180일 이상 지난 ready 파일이다. 발행·초안·revision·profile·홈 설정·PDF 표지 참조나 진행 중인 작업이 있는 asset은 제외한다. DB는 대상을 7일 격리하고 참조 쓰기 trigger로 신규 연결을 막는다. 보존 기간이 지난 뒤 worker가 Supabase Storage API로 파일을 지우고, `cleanup_finalize`가 참조를 다시 검사한 후 DB 행을 제거한다. Storage 오류는 5분 lease 만료 뒤 재시도한다. `storage.objects`를 직접 SQL로 삭제하지 않는다.

`asset.access` signed URL 유효기간은 300초다. 화면은 만료 45초 전에 같은 API action으로 새 URL을 요청한다. URL을 발급한 뒤 글이 비공개가 되더라도 이미 발급한 URL은 만료까지 열릴 수 있으므로 URL은 공유/로그/영구 저장하지 않는다. PDF 원본은 비공개 다운로드와 브라우저 PDF viewer에서 사용하고, 첫 장 preview asset은 API가 승인한 private URL로 읽는다.

## 로컬 대체

원격 Supabase에는 migration과 Edge API v5를 적용했다. worker 컨테이너는 아직 상시 배포하지 않았고, 격리된 환경에서 정리 시나리오를 검증한 뒤에만 실행한다. 새 환경에서는 DB migration과 Edge Function을 worker보다 먼저 배포한다. worker를 실행하면 7일 격리 기간이 지난 후보 파일은 자동 삭제된다.
