# 최종 배포까지의 작업 목록

기준일: 2026-10-08. 구현 상태는 이 브랜치의 기능별 커밋과 실제 원격 이력을 구분해 기록한다. 기존 Supabase `travel-blog`의 migration 33개가 `20261008013658`까지 모두 적용됐고, 배포된 `travel-api`는 v19다. 로컬의 새 오류 수집 Edge 코드는 운영에 아직 배포하지 않았다. 별도 `travel-blog-staging`에는 migration 33개와 `travel-api` v1을 적용하고 SQL·HTTP 권한 검사를 마쳤다. 실제 카카오 owner 로그인·파일 변환·Vercel Preview 종단 검증은 남아 있다. `[x]`는 코드 구현 또는 해당 줄에 기록된 검증을 완료했다는 뜻이며, staging/운영 검증이 필요한 항목은 별도로 남긴다.

## 현재 출발점

| 영역        | 마련된 기반                                                                                  | 남은 핵심 작업                                       |
| ----------- | -------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| 모노레포    | pnpm/Turbo, web/admin, 계약·API·UI·에디터·PDF reader·media-worker 패키지                     | 기능별 PR 검토와 배포 환경 재현                      |
| 개발·검증   | MirageJS, mock/Supabase 스크립트, unit/contract/E2E/SQL 테스트 기반                          | 새 기능의 staging 종단 검증과 CI 통합                |
| Supabase    | Auth, DB/RLS, Edge API, 글·댓글·좋아요·자산 API 및 migration 코드                            | 최신 migration/Edge 배포 이력과 staging DB 대조      |
| 작성 도구   | 자동 저장·충돌 복구·발행, 이미지 배치/크기 조절, 초안 공개형 미리보기                        | 실제 작성·업로드 종단 검증                           |
| 공개 사이트 | 홈 carousel/템플릿, 목록·상세·댓글·PDF viewer와 로딩/오류 상태                               | 실데이터, 도메인, 반응형 사용성 최종 검수            |
| 운영        | Firebase Analytics 초기화, Docker worker, 미디어 1회 Function/Cron 코드, 자체 오류 관측 설계 | 오류 수집·GA 동의·미디어 Preview/운영 배포·복구 검증 |

2026-10-08 코드 상태: 작성기 공개 미리보기·수정 이력 UI, 자체 오류 관측, 미디어 1회 처리 Function/Cron을 기능별 커밋으로 정리했다. `pnpm check`는 통과했다. 실제 환경의 기능 검증과 PR 병합은 별개다. 연결된 `travel-blog`의 migration 33개는 원격 적용됐지만, 새 오류 수집 Edge 코드는 배포 전인 v19다. 원격 버전과 migration 목록을 `supabase/deployment.json`에 기록했다.

2026-10-08 미디어 이행 상태: Docker worker의 처리 함수를 1회 실행 가능한 모듈로 분리하고 관리자 Node Function·보호된 경로·매분 Cron 설정과 큐/정리 lease 보정 migration을 추가했다. 관련 함수 테스트와 PostgreSQL 17 격리 테스트는 통과했다. 미디어 migration은 기존 `travel-blog`와 신규 staging에 적용됐고, staging에서 lease·참조 fencing rollback SQL을 통과했다. 실제 Storage API 삭제와 Vercel Preview native 빌드/파일 변환은 별개다. 연결된 Vercel 계정에는 `travel-blog` web/admin 프로젝트가 보이지 않았다. [전환·운영 가이드](docs/media-worker-vercel-supabase.ko.md).

**현재 배포를 막는 핵심은 staging에서 최신 DB/API와 media-worker를 함께 검증하고 두 Vercel 프로젝트와 Supabase SaaS를 실제로 연결하는 일이다.** 코드상 OAuth와 API 흐름, Docker 및 Vercel 1회 처리 경로가 마련됐지만 최신 migration 배포 기록·실제 파일 처리·정리 재시도는 staging에서 다시 확인해야 한다. Mock 통과만으로 OAuth·Storage·RLS·파일 변환의 정상 동작을 판단할 수 없다.

## 우선순위와 진행 순서

- **P0:** 이후 개발 또는 배포를 막는 연결·데이터·운영 필수 작업.
- **P1:** 설계한 서비스를 첫 공개하기 위해 구현·검증할 제품 기능.
- **P2:** 첫 공개 이후의 확장 후보. 기존 요구를 삭제하는 의미가 아니며, 공개 범위를 줄일 경우 별도 합의한다.

| 순서 | 우선순위 | 작업 묶음                   | 선행 조건             | 완료 기준                                      |
| ---- | -------- | --------------------------- | --------------------- | ---------------------------------------------- |
| 1    | P0       | 환경·계정·인증 연결         | 없음                  | 실제 owner 로그인과 권한 확인, staging 구성    |
| 2    | P0       | API 계약과 데이터 접근 정리 | 1                     | 동일 기능을 mock/실제 API로 실행하고 응답 검증 |
| 3    | P0       | 미디어 업로드·worker 운영   | 1–2                   | 실제 사진/PDF가 처리되어 공개 열람 가능        |
| 4    | P1       | 디자인 시스템·화면 골격     | 최신 Penpot 기준 확정 | 공통 토큰과 반응형 web/admin 레이아웃 적용     |
| 5    | P1       | 관리자 작성·발행            | 2–4                   | 저장→재접속→수정→발행→철회 가능                |
| 6    | P1       | 공개 블로그와 홈 편집       | 2–5                   | 다섯 분류의 실제 글과 선택한 홈 표시           |
| 7    | P1       | 댓글·좋아요·독자 계정       | 1–2, 6                | 회원/비회원 상호작용과 관리자 처리 완료        |
| 8    | P0       | 관측·권한·운영 절차         | 1, 3, 5–7             | 오류 감지, 동의 기반 분석, 복구 절차 확인      |
| 9    | P0       | 통합 QA·배포 자동화         | 1–8                   | 실제 staging 종단 테스트와 배포 리허설 통과    |
| 10   | P0       | 운영 배포·공개 확인         | 9                     | 실제 도메인에서 핵심 시나리오와 장애 대응 확인 |

도메인·호스팅·OAuth 등록은 1단계부터 착수한다. 4단계 디자인 구현은 2–3단계와 병행할 수 있다. 전체 화면을 만들기 전에 **사진이 있는 글 한 편을 실제로 저장·발행하고 공개 상세에서 읽는 흐름**을 먼저 완성한다.

## 1. 환경·계정·인증 연결 — P0

- [x] 개발/staging/운영 Supabase 사용 범위를 정하고 앱·worker 호스팅과 web/admin 도메인을 결정한다. 현재 프로젝트를 어느 환경으로 사용할지 명시한다.
- [x] 실제 공개 키를 profile에 설정하고 `pnpm test:supabase`로 Auth 설정·Edge 상태·공개 조회를 확인한다. 비밀 키는 서버의 비밀 저장소로 관리한다.
- [x] 지정된 최초 owner의 앱 Auth 가입·이메일 인증과 membership 부여를 확인한다. Supabase 콘솔 계정과 앱 계정을 구분한다.
- [x] localhost의 블로그(3000)·관리자(3002)에서 실제 Supabase 카카오 provider와 callback/로그아웃 동작을 검증한다.
- [ ] staging·운영 배포 후 각 도메인의 카카오 callback/로그아웃 동작을 검증한다.
- [x] 로그인 취소·실패·세션 만료·로그아웃·관리자 권한 없음 화면을 연결하고, 권한 회수 후 재요청이 거절되는지 확인한다.
- [x] 빈 로컬 또는 격리된 staging DB에 migration 전체를 재생한다. 기존 관리 함수 의존성과 초기 owner 설정을 점검하고 환경별 bootstrap 대상을 관리한다.

2026-09-26 검증: 원격 Auth의 지정 owner 이메일 인증·활성 membership 확인. 추가로 owner를 부여한 카카오 계정으로 실제 원격 Supabase에 연결한 localhost web/admin의 OAuth 로그인·각 앱 홈 복귀·세션 유지·관리자 글쓰기 접근·양쪽 로그아웃 후 접근 차단까지 확인했다. localhost의 두 앱은 포트가 달라도 인증 쿠키를 공유한다. 격리 DB에서 당시 전체 migration 7개, SQL 4개와 실제 Auth/Edge를 사용하는 앱 권한·세션 만료·로그아웃 검증 통과. 사용자 요청에 따라 localhost 검증을 완료 처리하고, 배포 도메인별 callback/로그아웃 검증은 별도 미완료 항목으로 분리했다. 상세 결과와 재현 절차는 로컬 전용 검증 기록에 보관한다.

2026-10-08 신규 staging 검증: 빈 DB에 현재 migration 33개를 순차 적용하고 Edge v1을 배포했다. owner bootstrap 대상은 설정했으나 실제 staging Auth 가입 전이므로 membership은 없다. 초기 owner·권한 회수·오류 상세·미디어 lease 등 rollback SQL 7개, 공개 API HTTP 3개, 실제 JWT의 admin 조회 200/editor·회수자 403, 오류 수집 202를 확인했다. MCP가 32개 migration의 원격 버전을 다시 발급했으므로 정합화 전 staging `db push`는 금지한다. [검증 기록과 남은 범위](supabase/STAGING.ko.md).

완료 기준: 실제 owner는 관리자에 접근하고 일반 독자는 접근하지 못하며, 빈 환경에서 DB와 API를 재현할 수 있다. 기존 운영 후보 DB에 reset이나 초기 owner 테스트 fixture를 실행하지 않는다.

## 2. API 계약과 데이터 접근 — P0

- [x] `packages/contracts`에 사용할 action별 입력·응답 Zod 스키마를 추가하고, `packages/api-client`에 타입이 있는 호출 함수를 연결한다.
- [x] 목록·상세의 서버 렌더링용 호출과 브라우저 변경 요청을 구분한다. 모두 기존 `travel-api`를 사용하고 브라우저의 테이블/RPC 직접 접근은 사용하지 않는다.
- [x] 세션 토큰·비회원 방문자 토큰 수명, 인증 오류, 권한 오류, 409 버전 충돌, 429 대기 시간을 일관되게 처리한다.
- [x] TanStack Query 키·무효화·페이지 이동·중복 제출 방지와 mutation 실패 시 입력 보존을 구현한다.
- [x] 실제 API 응답을 기준으로 Mirage fixture·오류 상태·계약 테스트를 맞춘다. 정상뿐 아니라 빈 목록·권한 거절·지연·실패·충돌을 포함한다.
- [x] 서버 조회 테스트는 별도 테스트 경로나 격리된 실제 backend로 구성한다. 브라우저 Mirage가 SSR 요청까지 가로챈다고 가정하지 않는다.

2026-09-26 첫 항목 완료: 실제 Supabase `travel-blog`의 Edge v2·DB 함수·컬럼과 대조한 33개 action 계약 및 타입 호출을 추가했다. 원격 HTTP 검사 8개와 관리 SQL 읽기 응답 7개의 스키마 검사를 통과했다. 공개 글이 없는 원격 환경의 실제 상세/쓰기 데이터 검증은 후속 통합 QA에서 진행한다. 아래 구현은 격리된 fixture·HTTP backend로 검증했다. [계약·검증 범위](packages/contracts/README.ko.md).

2026-09-26 나머지 5개 항목 완료: 서버 read/브라우저 mutate 분리, 세션·방문자 만료와 401/403/409/429 처리, Query 캐시·페이지·중복 제출 제어, Mirage 응답 Zod 검증과 오류 시나리오, JS 비활성 SSR 테스트를 추가했다. 기본 테스트 82개, Mirage 브라우저 7개, SSR 3개, 실제 Supabase HTTP 9개 통과. 원격 travel-api v3에는 승인된 응답 헤더 노출 한 줄만 변경했다.

2026-10-07 추가 구현: PDF 자산 라이브러리, 서버 측 관리자 댓글 필터, 홈 추천 글 검색/페이지 이동, 공개 글 바로가기용 action 및 DB migration을 추가했다. 해당 migration은 기존 프로젝트와 신규 staging에 적용됐다. 최신 Edge 소스는 staging v1에서 HTTP 검사를 통과했지만 운영 Edge v19에는 아직 배포되지 않았다.

완료 기준: 한 기능의 UI 코드에서 임의 샘플 데이터를 직접 참조하지 않고, 실행 모드 변경으로 동일 계약의 API를 호출한다. Mock의 탭별 초기화와 업로드 미지원 범위는 문서에 유지한다.

## 3. 사진·PDF 업로드와 worker — P0

- [x] Python 대신 모노레포 `@repo/media-worker` TypeScript 패키지를 사용한다. Node.js `sharp`로 이미지 방향 보정·EXIF 제거·대표 이미지를 만들고, `pdfjs-dist`와 Node Canvas로 PDF 페이지 수·첫 장 표지를 만든다.
- [x] 신뢰된 Node.js 컨테이너 실행 명령과 polling loop를 마련한다. Supabase worker RPC의 5분 lease·만료 lease 회수·최대 5회 지수 backoff를 유지하고 요청 timeout, 입력 크기/픽셀/페이지 제한, 구조화 로그를 적용한다.
- [x] 관리자에서 파일 등록→signed upload URL 전송→`asset.complete`→상태 polling을 연결한다. 업로드/처리 중·완료·실패를 표시하고 재시도 및 원격 작업 취소를 제공한다. 취소된 파일은 failed 상태로 남는다.
- [x] 이미지 방향·위치정보 제거, 1600px 파생 파일, 대표 사진 선택 UI, BlockNote asset ID 이미지 블록과 캡션을 연결한다. 발행 renderer는 asset ID로 승인된 signed URL을 조회한다. 관리자 초안의 서버 저장 연결은 5단계 작업이다.
- [x] PDF private 업로드·쪽수와 첫 장 표지 생성·private 원본 다운로드 링크·브라우저 뷰어를 연결한다. 손상·암호화·1–200쪽 제한·20MB 초과 오류를 안내한다.
- [x] 기존 `asset.access`로 발급하는 5분 private signed URL을 만료 전에 갱신한다. 공개 글의 파일도 private 버킷과 API 권한 확인을 거치며, 비공개 전환 전에 발급한 URL은 만료까지 유효할 수 있음을 문서화한다.
- [x] DB migration과 worker에 7일 격리·참조 fencing·Storage API 삭제·최종 참조 재검사 설계를 추가하고 Supabase에 적용한다.
- [x] Docker polling의 변환/정리 함수를 `@repo/media-worker/processor`의 1회 실행으로 분리하고, 관리자 Node Function의 `CRON_SECRET`·기능 flag 검사와 Vercel Cron 설정을 로컬 코드에 추가한다. 기존 Docker 실행은 fallback으로 유지한다.
- [x] 새 migration에서 미디어 claim을 `process_asset`으로 제한하고 만료된 삭제 lease의 재획득과 참조 재검사를 추가한다. PostgreSQL 17 격리 컨테이너 테스트에 이어 전체 migration을 재생한 staging에서 rollback SQL 검사를 통과했다. 실제 파일 처리는 별도 항목으로 남긴다.
- [ ] Supabase migration 적용 후 격리된 staging에서 미참조·참조 중·삭제 실패·lease 재시도 흐름을 검증한다. `storage.objects` 직접 SQL 삭제는 사용하지 않는다.
- [ ] Vercel admin Preview에서 Linux native 번들·실제 고화질 이미지/PDF 변환·401/503·함수 중단/겹침을 확인하고, 운영 Cron canary 전에는 동일한 큐의 Docker polling을 중지한다. 로컬 선택 경로 webpack 빌드는 통과했지만 Preview 실행 검증은 별개다. 매분 Cron은 Pro 이상이 필요하다.

2026-09-30 추가 구현: Docker build/run 명령, `.dockerignore`, 새 `sb_secret_...` 키를 `apikey`에만 사용하는 worker 인증 처리와 권한 회귀 테스트를 추가했다. 실제 worker 실행에서 `travel_media_cleanup` 403을 확인해 내부 helper의 `service_role` 실행 권한 누락을 migration으로 수정하고 원격 권한을 재확인했다. migration 적용 뒤 worker가 큐 작업을 성공 처리하는 종단 확인은 아직 없다. Docker 명령은 루트에서 `pnpm media:worker:docker:build`, `pnpm media:worker:docker:run`이다.

2026-10-06–07 추가 구현: PDF 원본 보존, 기존 PDF 자산 재사용, 사용하지 않는 자산 삭제 API/화면을 보강했다. migration은 기존 프로젝트와 신규 staging에 적용됐다. Staging DB의 삭제·lease SQL은 통과했지만 실제 Storage 객체 삭제는 미검증이다.

구현 상태: 관리자 업로드 UI, TypeScript 변환, 취소 API, private signed URL viewer/갱신, Docker 실행과 Vercel 1회 Function/Cron 코드, 격리·재검증 정리 로직을 마련했다. 기존 프로젝트·staging migration 적용과 staging SQL 검사는 완료했다. 실제 Storage 삭제와 사진/PDF 종단 검증은 남아 있으며, Vercel Function/Cron 코드를 배포·운영 완료로 계산하지 않는다. [세부 배포 순서](docs/media-worker-vercel-supabase.ko.md).

## 4. 디자인 시스템과 화면 골격 — P1

- [x] 최신 다섯 분류와 홈 D 기본안을 기준으로 Penpot 화면·텍스트·전환 목록을 확정한다. 오래된 여섯 분류 문서보다 최신 설계를 우선한다.
- [x] 종이색 `#F6F5EF`, 잉크색 `#173C42`, Noto Serif KR/Noto Sans KR, 본문 18px와 48px 조작 영역을 공통 UI 토큰에 반영한다.
- [x] Input·Select·Dialog·Toast·Tabs·Table·Pagination·Skeleton 등 실제 화면에 필요한 공통 컴포넌트를 추가한다.
- [x] 공개 헤더·메뉴·푸터와 관리자 탐색 구조를 만들고, 로딩·빈 상태·오류·접근 거절을 공통화한다.
- [x] 휴대폰·태블릿·PC·좁은 폴더블에서 탐색과 편집을 확인한다. 키보드 포커스와 reduced-motion을 적용한다.

2026-09-26 구현·검증 기록: 연결된 Penpot의 `00 · Foundation & Components`, `02 · Admin`, `04 · 여행책 V2`를 읽어 다섯 메뉴, 홈 D의 엽서 카피, PC·휴대폰 보드, 관리자 편집 목록과 주요 전환을 확인했다. 최신 분류 이름은 하루 걷기 / 머무는 여행 / 맛과 커피 / 머문 숙소 / 여행 일정표다. 공용 Tailwind 토큰과 컴포넌트, 공개·관리자 탐색 프레임, 분류별 목록 필터와 공통 상태 화면을 구현했다. 로컬 Chromium에서 공개 홈·분류 목록·관리자 에디터·홈 디자인을 확인하고 344/390/768/834/1114/1440 폭에서 가로 넘침이 없음을 확인했다. 모바일 메뉴 열기, 현재 분류 표시, 빈 목록, Tab 포커스 표시도 확인했다. reduced-motion은 CSS 미디어 규칙에 반영했다. 홈 D 사진은 실제 부모님 사진이 연결되기 전까지 자리 표시자로 노출한다. 브라우저 폭 검사는 실제 하드웨어 접힘선 검증과 구분한다. ESLint와 TypeScript 검사는 UI·web·admin에서 통과했다. 격리한 Next 최적화 빌드는 진행 로그 없이 최적화 단계에서 대기해 중단했으므로 완료 검증으로 계산하지 않는다.

2026-10-06–07 추가 구현: 공개 홈 커버 carousel, 글 목록/상세 레이아웃, 사진 overlay cover와 paired-photo 표시, PDF 전용 커버 및 inline reader, 페이지별 loading/error 상태를 추가했다. 관리자 홈 cover 전체 화면 미리보기와 편집 흐름도 보강했다. staging에서 실제 사이트 설정·사진으로 디자인과 반응형 동작을 최종 확인해야 한다.

완료 기준: 최신 Penpot 디자인과 실제 UI가 공통 토큰을 사용하고, 부모님이 주요 버튼과 현재 상태를 쉽게 구분할 수 있다.

## 5. 관리자 작성·발행 — P1

- [x] 글 목록·분류/상태 필터·검색·새 글·수정·휴지통·복구 화면을 연결한다.
- [x] 다섯 분류별 메타데이터와 검증을 적용한다. 방문일, 여행/숙박 기간, 지역, 장소명, 카페/음식점 구분 등을 실제 API 계약과 일치시킨다.
- [x] BlockNote 원본 저장·다시 열기·자동 저장·마지막 저장 상태·미저장 이탈 보호를 구현한다.
- [x] 두 탭/기기의 409 충돌을 처리하고 최신본 확인·본인 입력 보존·수정 이력 복원 흐름을 제공한다.
- [x] 대표 이미지·본문 사진·태그·공개 미리보기·발행 전 검증을 연결한다. PDF 일정표는 별도 작성 흐름을 제공한다.
- [x] 발행·비공개 전환·삭제 확인과 실패 복구를 연결한다. 화면 버튼과 서버 권한을 모두 검증한다.

완료 기준: 부모님이 사진과 글을 작성하고 브라우저를 닫았다 다시 열어 이어 쓸 수 있으며, 발행 결과가 공개 사이트에 반영된다.

2026-09-26 1단계 구현·검증 기록: 관리자 글 목록과 분류/상태/제목·주소 검색, 페이지 이동, 새 글·PDF 초안 생성, 기존 글 편집/저장, 휴지통·비공개 복구를 `travel-api`에 연결했다. 필터 결과에 `category_code`를 포함하는 서비스 전용 Supabase RPC를 추가하고 실제 프로젝트에 migration 및 Edge Function v6을 배포했다. 원격 DB 회귀 SQL은 트랜잭션 롤백 방식으로 통과했다. 검증 도중 발견한 자산 참조 트리거의 `service_role` 실행 권한 누락과 테이블별 `NEW` 필드 평가 오류도 최소 권한 migration으로 수정했다. Vitest 85개, 실제 Supabase HTTPS 계약 9개, 관리자 TypeScript·ESLint가 통과했다. 운영 DB에는 글이 없어 목록 정상 응답이 빈 목록임을 확인했다. 관리자 Next 최적화 빌드는 60초 이상 출력 없이 최적화 단계에 대기해 중단했으며 통과로 계산하지 않는다.

2026-09-26 2단계 구현·검증 기록: 하루 걷기(방문일), 머무는 여행(시작/종료일), 맛과 커피(방문일·장소명·카페/음식점), 머문 숙소(체크인/체크아웃·숙소명)에 맞는 초안 입력을 추가했다. 미완성 초안은 저장할 수 있고 잘못된 달력 날짜·기간·장소 종류는 저장 전에 안내한다. 여행 일정표 PDF는 별도 메타데이터를 요구하지 않는다. 공유 계약 헬퍼와 Mirage 발행 검증을 실제 SQL 기준에 맞추고, Postgres 날짜 파싱 오류를 `422 invalid_date`로 매핑해 Edge Function v7에 배포했다. 원격 DB SQL 테스트에서 네 분류의 정상 게시와 잘못된 메타데이터 거절을 트랜잭션 롤백으로 확인했다. Vitest 100개, 실제 Supabase HTTPS 계약 9개, 관리자·계약·mock TypeScript/ESLint가 통과했다.

2026-09-26 3단계 구현·검증 기록: BlockNote 문서 원본, 제목·주소·분류별 정보·이미지/PDF 참조 변경을 초안 dirty 상태에 연결하고 입력이 멈춘 뒤 1.2초에 버전 조건부 자동 저장한다. 저장 중 상태와 마지막 저장 시각을 표시하며 저장 실패 시 입력을 보존하고 자동 재요청을 멈춘다. 다시 열린 초안의 기존 저장 시각도 보여준다. 페이지를 닫거나 내부 링크로 이동할 때 미저장 여부를 알리고 저장 후 이동을 선택할 수 있다. 관리자 TypeScript·ESLint, 전체 Vitest 100개가 통과했다.

2026-09-26 4단계 구현·검증 기록: 저장 응답 409 시 최신 초안을 다시 조회해 버전·시각·제목을 보여주고 편집 중인 입력은 덮어쓰지 않는다. 사용자가 최신본으로 교체하거나 최신 lock_version에 자신의 입력을 다시 저장하도록 선택할 수 있다. 서버 수정 이력 목록과 복원 버튼을 연결했으며 복원 자체도 버전 조건부이고 충돌하면 편집본을 유지한다. 기존 Mirage/API 계약 테스트에 stale version 409 및 revision restore 검증이 있다. 관리자 TypeScript·ESLint, 전체 Vitest 100개가 통과했다.

2026-09-26 5단계 구현·검증 기록: 글 태그를 초안 content에 저장하고 글 편집에는 사진 업로드·본문 삽입·대표 사진 선택만, PDF 일정표에는 PDF 업로드·미리보기만 노출하도록 분리했다. 공개 미리보기에는 분류·지역·제목·대표 사진·태그·본문 텍스트/사진을 표시하며 제목·주소·분류 메타데이터·본문·대표 사진 발행 준비 상태를 안내한다. 관리자 TypeScript·ESLint, 전체 Vitest 100개가 통과했다.

2026-09-26 6단계 구현·검증 기록: 확인 대화상자 이후 초안을 저장하고 최신 서버 버전으로 여행 글/PDF를 발행한다. 제목·주소·분류 메타데이터·본문·대표 이미지 또는 PDF 파일 체크를 적용했으며 실패는 입력을 보존하고 409 시 최신본을 다시 조회한다. 글 목록과 편집기에서 발행본 비공개 및 휴지통 이동/복구 동작을 연결했다. 삭제는 복구 가능한 휴지통 처리다. `travel-api`는 발행·상태 변경 모두 활성 membership과 버전을 검사하며, `supabase/tests/api.sql`에 비회원 publish/status 거절을 추가해 원격 프로젝트에서 트랜잭션 롤백 회귀 테스트를 통과했다. 관리자 TypeScript·ESLint, 전체 Vitest 100개가 통과했다.

2026-10-07 추가 구현: 글 요약과 표지 캡션 편집, 공개 사이트 레이아웃을 재사용한 draft preview, 서버 검증과 일치하는 publish checklist, 글별 댓글 마감, PDF 자산 라이브러리 재사용을 추가했다. 추천 글 관리에는 검색/페이지 이동과 실제 공개 글 링크를 연결했다. 편집기 playground는 제거했다. 작성기 preview·수정 이력 UI 변경은 별도 커밋으로 정리했으며, staging의 실제 작성 검증은 남아 있다.

## 6. 공개 블로그와 홈 편집 — P1

- [x] 홈·다섯 카테고리 목록·필터/페이지 이동·글 상세·관련 글·소개/기록·목차 화면을 실제 데이터로 구현한다.
- [x] 기본 홈 D와 A/B/C/D 템플릿 선택·초안 미리보기·명시적 적용을 연결한다. 초안 설정이 공개 홈에 먼저 노출되지 않게 한다.
- [x] 사진·캡션·여행 기간·게시일을 정확히 표시한다. PDF 카드에는 표지·제목·게시일만 표시하고 댓글/좋아요를 제공하지 않는다.
- [x] 빈 목록·없는 글·비공개/삭제된 글·네트워크 오류와 signed URL 갱신을 처리한다.
- [x] 제목·설명·canonical·OG·sitemap·robots와 관리자 검색 제외를 설정한다. OG 이미지는 검색봇이 읽을 수 있는 공개 정책을 별도로 정한다.
- [x] 초기에는 기존 `no-store` 정책을 유지하거나, 캐시를 도입한다면 발행·수정·철회 시 실제 재검증 hook까지 구현한다. 현재 cache outbox 완료 처리는 재검증을 수행하지 않는다.

완료 기준: 다섯 분류의 실제 콘텐츠가 반응형으로 보이며, 비공개 글과 관리자 정보가 목록·상세·검색 메타데이터에 노출되지 않는다.

2026-09-27 1단계 구현·검증 기록: 홈에서 공개 사이트 설정과 최근 공개 글을 서버에서 읽어 표지·추천 글·최근 기록을 채우고 클라이언트 API 조회를 재사용한다. 글 목록은 실제 공개 카드, 분류/태그 필터와 URL 기반 페이지 이동을 사용하며 브라우저 뒤로가기도 반영한다. 상세는 분류 목록으로 돌아가기, 관련 글, 본문 heading 기반 목차를 제공한다. 소개는 `site.get`의 사이트명·홈 설명을 사용하며 `/contents`에 다섯 분류 길잡이를 추가했다. 관리자(TypeScript·ESLint)와 전체 Vitest 100개가 통과했다.

2026-09-27 2단계 구현·검증 기록: 공개 홈은 실제 `published_settings.template_id`로 D 기본 엽서와 A 여백형·B 숲색 표지·C 장면 중심 배치를 표시한다. 관리자 홈 디자인은 owner membership과 설정 API를 확인한 뒤 A/B/C/D 초안 선택, 문구·추천 공개 글·대표 이미지 편집, 초안 저장, 별도 확인을 통한 공개 적용을 제공한다. 초안 설정은 공개 `site.get`에 포함되지 않고 `admin.settings.apply` 성공 후에만 홈에서 사용된다. 관리자·웹 TypeScript/ESLint와 전체 Vitest 100개가 통과했다.

2026-09-27 3단계 구현·검증 기록: 일반 글 카드에 대표 사진·지역·방문/여행/숙박 날짜·게시일·좋아요/댓글 집계를 표시한다. 상세 상단에는 분류에 맞춰 방문일·여행 기간·장소 종류/이름·지역·게시일을 표시하며 본문 `figcaption`을 사진 설명과 alt 텍스트로 유지한다. PDF 카드는 signed asset API에서 생성된 첫 페이지 표지, 제목, 게시일만 가지며 분류·태그·반응 수를 숨긴다. 웹 TypeScript·ESLint와 전체 Vitest 100개가 통과했다.

2026-09-27 5단계 구현·검증 기록: 웹 제목·설명·canonical·Open Graph/Twitter 메타데이터를 설정하고, 공개 `post.get`으로만 글 메타데이터를 만들며 실패/없는 글은 `noindex`로 처리한다. sitemap은 공개 목록 API 결과만 포함하고 robots에서 API·인증·로그인 경로를 제외한다. `/og/[slug]`는 공개 글의 cover 또는 PDF preview만 서버에서 읽어 전달하고 signed URL을 공개하지 않으며 캐시하지 않는다. 관리자 앱은 기존 루트 메타데이터 `noindex`를 확인했다. 웹 타입검사·ESLint와 전체 Vitest 100개 통과.

2026-09-27 6단계 구현·검증 기록: `travel-api` 서버 조회는 `cache: no-store`, 공개 페이지·sitemap·OG 응답은 동적 렌더링/`no-store`를 유지한다. 발행·수정·철회 cache outbox가 웹 CDN 재검증 hook으로 연결되어 있지 않아 캐시 도입은 미뤘다. 홈·소개·목록·상세·댓글·관련 글의 브라우저 쿼리는 `staleTime: 0`으로 서버의 공개 여부/발행 데이터를 재확인하도록 했다. 타입검사·ESLint·전체 Vitest 통과.

2026-10-06–07 추가 구현: 공개 탐색/소개, editorial 홈, 빈 목록과 loading/error 안내, 사진 중심 글 표지·viewer, 댓글 표시, PDF reader와 일정표 카드 UI를 보강했다. 디자인/동작 커밋은 있으나 최신 migration과 실제 공개 콘텐츠를 이용한 staging smoke test는 별도 수행해야 한다.

2026-09-27 4단계 구현·검증 기록: 서버 목록 조회 실패는 공개 재시도 상태로 이어지고, 빈 목록과 필터 결과 없음은 다른 안내를 보여준다. 목록은 13개를 조회해 12개만 그려 마지막 페이지의 잘못된 다음 이동을 방지하고 URL 필터 변경 직후 이전 쿼리 초기 데이터를 재사용하지 않는다. 서버에서 없는 글·비공개·삭제 글은 Next 404로 처리하고 전용 안내 화면을 추가했다. 이미지·PDF·PDF 표지와 본문 이미지 signed URL은 갱신 실패 시 다시 가져오기 버튼을 제공한다. 웹 TypeScript·ESLint와 전체 Vitest 100개가 통과했다.

## 7. 댓글·좋아요·독자 계정 — P1

- [x] 회원/비회원 댓글·답글·수정·삭제·신고와 글별 댓글 마감을 구현한다. 비회원 관리 비밀번호는 로그나 분석에 남기지 않는다.
- [x] 소셜 로그인 이동 전 작성 중인 댓글을 탭 세션에 보관하고 복귀 시 복원한다.
- [x] 일반 글 상세 상단 하트·선택 상태·실제 집계와 비회원 방문자 토큰을 연결한다. 실패 시 화면 상태를 복구한다.
- [x] 관리자 전체·미답변·신고·숨김 댓글 목록, 답글·숨김·복원·사유 확인을 연결한다.
- [x] 별명 변경·로그아웃·계정 삭제 요청 경로와 기존 댓글 처리 정책을 마련한다.
- [x] 중복 요청·비밀번호 오류·속도 제한·다른 사람 댓글 수정 시도·비공개 글 접근을 테스트한다.

완료 기준: 실제 독자가 남긴 댓글과 반응이 새로고침 후 유지되고, 관리자 처리가 공개 화면에 반영된다. PDF에는 관련 UI와 API 동작이 차단된다.

2026-09-27 7단계 1번 구현·검증 기록: 일반 글 상세의 댓글을 회원/비회원 작성으로 나누고, 계정 별명은 프로필 저장 후 사용하며 비회원 이름·관리 비밀번호는 API 입력에만 전달한다. 답글은 `parent_id`로 연결해 계층형으로 표시한다. 댓글 수정·삭제는 버전과 비회원 비밀번호 또는 로그인 세션으로 서버에서 검증하며, 신고는 회원 인증을 요구한다. 글별 댓글 마감 시 기존 공개 댓글은 읽을 수 있고 새 작성/답글은 숨긴다. PDF에는 UI를 렌더하지 않는다. API의 기존 중복 키·Argon2id·속도 제한·공개 상태 검사를 사용한다. 웹 타입검사·ESLint와 전체 Vitest 100개 통과.

2026-09-27 7단계 2번 구현·검증 기록: 카카오 로그인 링크를 누르면 현재 글의 댓글 작성 이름·본문만 `sessionStorage`에 저장하고 로그인 callback 후 같은 글의 댓글 위치로 복귀한다. 비회원 관리 비밀번호는 저장하지 않으며 돌아온 화면에서 다시 입력해야 함을 안내한다. callback은 내부 `/posts/{slug}` 경로만 허용하고 외부·관리자 등 다른 경로는 홈으로 제한한다. 취소/오류는 같은 글 복귀 경로를 로그인 화면에 보존한다. OAuth return-path 회귀 검증 포함 Vitest 102개·웹 TypeScript·ESLint 통과.

2026-09-27 7단계 3번 구현·검증 기록: 일반 글 상세 상단에 접근성 있는 좋아요 토글과 실제 수를 연결했다. API `like.get`은 현재 회원/방문자 상태와 집계를 함께 반환하고, 비회원 토큰은 탭 세션 동안 새로고침 후에도 재사용한다. 변경은 optimistic UI로 즉시 반영하고 실패 시 서버값으로 복구한다. Mirage·계약·토큰 테스트 포함 전체 Vitest 104개와 웹 TypeScript 통과. Supabase `travel_like_get` 실행 권한은 `service_role`만 보유하는 것을 확인했다. ESLint 바이너리가 현재 설치 상태에 없어 재실행은 수행하지 못했다.

2026-09-27 7단계 4번 구현·검증 기록: 관리자 `/comments`에 전체·미답변·신고·숨김 필터와 댓글 답글, 숨김·복원, 신고 처리·기각 및 사유 표시를 연결했다. 글 제목·직원 답변 여부는 회원 전용 API 응답으로 제공하고, 댓글 변경은 기존 감사 이력 경로를 사용한다. `travel_admin_comments`는 membership 검사를 수행하며 RPC 실행 권한은 `service_role`에만 부여했다. migration 적용·Edge v9 배포, 관리자 TypeScript·ESLint와 전체 Vitest 106개 통과. 실제 프로젝트에는 댓글/신고 데이터가 없어 실데이터 화면 검증은 남아 있다.

2026-09-27 7단계 5번 구현·검증 기록: 공개 사이트 `/account`에서 로그인 이메일·별명 변경·로그아웃·삭제 요청을 제공하고, 요청은 중복 제출 시 기존 pending 요청을 반환한다. 관리자 전용 `/account-deletions`에서 댓글 익명 처리 후 Supabase Auth 삭제, 완료 표시 순서를 안내·검증한다. 댓글 본문은 남기되 Auth ID, 프로필 연결, 비회원 수정 자격증명을 삭제하며 필요한 모든 사이트의 owner/admin 검증 후에만 처리한다. 계정 요청/대기열 RPC는 service_role만 실행 가능하고 DB 권한을 확인했다. Supabase migration 적용·Edge v10 배포, Vitest 111개·web/admin TypeScript·ESLint 통과. 실제 계정 삭제는 수행하지 않았다.

2026-09-27 7단계 6번 구현·검증 기록: 중복 댓글 요청·idempotency 충돌·비회원 비밀번호 실패·API 429/Retry-After·회원 댓글 타인 수정 거부·비공개 글/자산 차단을 Mirage 및 SQL 통합 시나리오에 포함했다. 로컬 Supabase 전체 migration을 재생하고 `supabase test db --local supabase/tests/api.sql` 통과(1 TAP test, 내부 SQL assertion 포함), 전체 Vitest 113개, web/admin TypeScript·ESLint 통과.

2026-10-07 추가 구현: 관리자 댓글 받은 편지함을 전체/미답변/신고/숨김 상태로 서버에서 필터링하고, 공개 글의 댓글 작성자 표시를 정리했다. 관리 migration/API 계약과 Mirage 테스트가 추가됐다. 실제 운영 댓글 데이터가 적거나 없는 상태에서 staging 권한·페이지 이동·필터 결과를 확인해야 한다.

## 8. 관측과 운영 준비 — P0

첫 공개의 목표 구조는 **Vercel의 web/admin 두 Next.js 프로젝트 + Supabase SaaS의 Auth/Postgres/Storage/`travel-api`**다. 미디어 변환은 기존 Supabase 큐를 유지하고 Vercel Cron이 호출하는 짧은 Node Function으로 옮긴다. **`@repo/media-worker`의 1회 처리, 관리자 Function과 Cron 설정은 로컬 구현됐고 미디어 migration은 기존 `travel-blog`에 적용됐지만, Vercel 배포·실제 파일 검증은 아직이다.** Docker polling은 이전 기간의 fallback이다. Supabase migration과 Edge Function도 Vercel Git 자동 배포만으로 적용되지 않는다. [Vercel monorepo](https://vercel.com/docs/monorepos), [Vercel Cron 요금·주기](https://vercel.com/docs/cron-jobs/usage-and-pricing), [Supabase Edge Function 한도](https://supabase.com/docs/guides/functions/limits).

- [ ] 자체 오류 관측용 `app_private.web_error_issues`/`web_error_events` 및 마스킹된 메시지·스택 상세 migration과 `travel-api`의 `error.capture`/`admin.errors`/`admin.error.get`을 격리 staging에 적용한다. 저장소에 코드가 생긴 것과 원격 적용·수집 성공은 별개다.
- [ ] web/admin의 브라우저·React 경계·Next 서버 오류 수집을 실제 환경에서 시험하고, 수집 실패가 본래 사용자 동작을 막지 않게 한다. `NEXT_PUBLIC_ERROR_MONITORING_ENABLED`는 migration·Edge 배포와 권한 검사 뒤에만 켠다.
- [ ] 기존 Sentry SDK/DSN 의존성이 배포 bundle·서버 설정에서 제거되고 자체 collector만 요청하는지 확인한다. 기능 flag가 꺼진 환경은 외부 오류 전송을 하지 않아야 한다.
- [ ] 관리자 오류 분석 화면은 서버와 API 모두 **활성 `admin` 역할만** 허용하고, 비로그인·`editor`·`owner`·권한 회수 계정의 조회를 401/403으로 거절한다. 현재 역할 정책과 의도적으로 다른 제한이므로 출시 전 운영 담당자를 지정한다.
- [ ] 보관 기간·일일 정리·수집량/비용 상한·알림 임계값·담당자를 정하고 테스트 오류, 권한 거절, 반복/폭주 이벤트, 정리 실행을 검증한다.
- [ ] GA4/Firebase Analytics를 실제 property에 연결하되 동의 저장·철회, 홈 밖 페이지 이동, 미동의 무수집, staging 제외를 검증한다. 광고 동의는 분석 동의와 분리한다.
- [ ] 관리자 회원/역할 관리·마지막 owner 보호·감사 이력 조회를 연결한다. 연결되지 않은 통계는 0이 아니라 미설정으로 표시한다.
- [ ] API 오류·미디어 큐 적체/실패·Storage 사용량, Vercel/Supabase 로그의 확인 경로와 담당자에게 전달되는 알림을 정한다.
- [ ] 개인정보 안내·댓글 운영 기준·계정 삭제·사진 사용 권한·문의 경로를 실제 운영 정책에 맞춰 작성한다.
- [ ] DB와 Storage 각각의 백업·보존·복구 목표를 정하고 격리 환경에서 복원한다. 비밀값 교체·권한 회수·문제 글 비공개·배포 롤백·미디어 재처리 절차를 연습한다.

### 8-1. Sentry 대체: 자체 웹 오류 분석의 기능과 데이터 경계

Sentry가 제공하던 핵심은 브라우저/서버 예외 수집, 같은 오류의 그룹화, 릴리스별 회귀 확인, source map을 이용한 스택 복원, 검색·알림이다. 자체 구현 1차 범위는 **제한된 오류 이벤트 수집 → fingerprint별 이슈 집계 → admin 전용 목록·상세 조회**다. 자동 source map 업로드·스택 복원, 성능 tracing, 세션 replay, 고급 알림은 아직 동등하게 대체되지 않는다. 추가 migration은 **마스킹된** `Error.message`와 stack, 허용된 상대 빌드 파일·줄·열, 고정 작업 코드·의존 서비스·HTTP 상태·원래 요청 상관 ID를 저장한다. 원문 전체·요청 본문·latency는 저장하지 않는다. 수집기와 앱 API가 같은 Supabase Edge·DB에 있어 Supabase 장애 자체는 이 수집기로 기록할 수 없다. Vercel/Supabase 런타임 로그, 외부 가용성 probe와 요청 상관 ID를 함께 사용해야 하며, 5xx/급증/큐 정체 알림은 별도로 구현·검증한다.

[오류 관측 SQL migration](supabase/migrations/20261007114242_web_error_monitoring.sql)은 기본 필드를 정의한다. 연결된 `travel-blog` DB에는 이 migration과 [마스킹 상세 migration](supabase/migrations/20261007130601_web_error_masked_details.sql), [안전한 진단 문맥 migration](supabase/migrations/20261007131630_web_error_safe_context.sql)이 모두 적용됐다. **새 Edge 배포와 실제 오류 수집은 미검증**이다. 세 migration의 순차 재생과 권한·입력 검사는 격리된 로컬 PostgreSQL에서 수행했으며, 별도 staging 전체 migration 재생과 실제 수집 검증은 남아 있다.

| 저장 대상                      | 구현된 필드                                                                                                                                   | 보관하지 않는 정보                                                                      |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `app_private.web_error_issues` | 기존 요약과 최근 `last_masked_message`(1,024자)·`last_masked_stack`(4,096자), 최근 작업·의존 서비스·HTTP 상태·원래 요청 ID·안전한 stack frame | 원문 요청·사용자 식별자·원본 URL/query                                                  |
| `app_private.web_error_events` | 기존 이벤트와 `masked_message`(1,024자)·`masked_stack`(4,096자), 작업·의존 서비스·HTTP 상태·원래 요청 ID·안전한 stack frame                   | latency, 요청 본문·헤더·쿠키·Authorization·원본 IP/user agent·로컬 절대 경로·signed URL |

두 테이블은 `app_private`에 두고 공개 Data API 권한을 주지 않는다. `service_role`만 실행 가능한 `public.travel_error_capture`가 허용 필드·길이·형식·route의 query/hash 부재를 재검증하고 동일 fingerprint를 원자적으로 증가시킨다. 구조화한 frame은 허용된 상대 파일 경로와 줄·열만 최대 10개 저장하고, 임의 절대 경로·URL·쿼리·추가 필드는 거절한다. `public.travel_admin_error_issues`는 요약만, `public.travel_admin_error_issue`는 최근 이벤트 최대 20건의 마스킹 텍스트와 진단 문맥을 반환한다. 두 읽기 함수 모두 `app_private.require_member(..., ['admin'])`로 현재 활성 역할을 확인한다. **보존기간 삭제 job은 아직 구현되지 않았다.** 4KiB 스택을 일당 최대 2,000건씩 30일 남기면 텍스트만 약 240MiB에 이르므로 상세 이벤트는 14일 이내 보관을 초기안으로 삼고, 이슈의 최근 마스킹 텍스트도 같은 기한 뒤 지우는 정리 job·실제 용량 상한을 공개 전 확정한다.

브라우저는 같은 출처의 Next `/api/errors`에 메시지·스택을 **전송 전에 마스킹**한 봉투만 보내고, 서버 릴레이가 다시 마스킹한 뒤 전용 `TRAVEL_ERROR_REPORT_KEY`를 붙여 `travel-api`에 전달한다. 비회원 공개 페이지도 오류를 보고할 수 있으므로 브라우저에는 비밀 키가 없다. Next 릴레이는 정확한 같은 출처 `Origin`을 요구하고 허용 필드만 전달하며 app/environment/release를 서버 설정으로 고정한다. 알 수 없는 route는 `/unknown`으로 축약한다. Edge도 재마스킹하고 진단 문맥을 재검증하며 전용 키, 16KiB 보고 본문 상한, 형식, 경로 템플릿, 전체 분당 120건·일당 2,000건·동일 fingerprint 분당 10건 제한을 검사한다. `code`는 기존 DB `message`에 저장해 그룹화에 사용하고, 진단 텍스트는 별도 마스킹 컬럼에 둔다. URL 전체·이메일·IP·로컬 경로·일반적인 인증 토큰 패턴을 제거하지만 자유 서술문에 포함된 모든 개인정보를 자동 인식한다고 보장할 수 없다. 예외 메시지에 입력값·요청 내용을 포함하지 않도록 작성하고, 의심스러운 보고는 버린다. 서버 digest가 있는 React 경계 오류는 서버 instrumentation이 기록하므로 브라우저에서 재전송하지 않는다. `Origin`은 비브라우저 요청에서 위조할 수 있으므로 인증 수단이 아니며, 브라우저가 제출한 원래 요청 ID도 인증 증거가 아닌 조사 단서다. 공개 릴레이의 남용과 정상 텔레메트리 한도 소진은 여전히 가능하다. 운영 공개 전 Vercel Firewall의 `/api/errors` 경로별 IP/버스트 제한, 저장량·비용 상한과 429 표본 누락 감시를 설정한다. 동일 route·이름·code의 다른 원인은 한 이슈로 합쳐질 수 있으므로 필요한 경우 개발자가 고정한 별도 code를 사용한다. 전송 실패·429는 사용자 화면을 막거나 무한 재시도하지 않는다. 관리자 `admin.errors`와 `admin.error.get`은 요청마다 검증된 Auth user와 사이트의 활성 `admin` membership을 확인한다. 기간·상태 필터/해결 처리 기능은 후속 API 작업이다. UI 숨김이나 client-side role 확인만으로는 충분하지 않다. [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security), [Supabase API keys](https://supabase.com/docs/guides/api/api-keys), [Vercel Functions 로그](https://vercel.com/docs/functions/logs).

코드 위치 복원이 필요하면 배포와 **동일한 산출물**의 비공개 source map을 보관해야 한다. 기본 Next/Vercel 빌드는 `productionBrowserSourceMaps=false`로 공개 `.map`을 만들지 않는다. `web`·`admin`의 `build:private-maps`는 격리된 임시 빌드의 map을 저장소 밖의 `TRAVEL_SOURCE_MAP_ARCHIVE_DIR`에 release/빌드 ID별로 보관하고 공개 산출물의 map과 참조를 제거하는 로컬 조사 경로다. 보관된 동일 빌드의 frame은 `pnpm error:source-map:lookup <보관된 빌드의 절대 경로> <_next/static/chunks/파일.js> <줄> <열>`로 오프라인 조회할 수 있다. 이 임시 빌드는 Vercel에 배포되는 빌드와 같다고 보장할 수 없으므로 **운영 이벤트의 자동 원본 위치 복원은 아직 지원하지 않는다.** 운영에 적용하려면 실제 배포 빌드의 map을 별도 비공개 저장소로 원자적으로 올리고 해당 빌드 ID를 이벤트 release와 연결한 다음 공개 `.map` 부재를 확인해야 한다. 원본 소스·map은 관리자 API/브라우저에 직접 제공하지 않는다.

수집 활성화 순서: staging SQL과 새 `travel-api`를 적용하고 별도의 무작위 `TRAVEL_ERROR_REPORT_KEY`(32바이트 이상)를 Supabase Edge secret과 web/admin 두 Vercel 프로젝트의 **서버 전용** 환경변수에 동일하게 등록한다. 이 키는 Supabase `service_role`/`sb_secret_...` 키를 재사용하지 않는다. 두 앱에는 `NEXT_PUBLIC_DEPLOY_ENV=preview`, `NEXT_PUBLIC_APP_RELEASE=<배포 식별자>`를 두고 오류 주입·202/403·역할 거절·폭주/429를 확인한 뒤에만 `NEXT_PUBLIC_ERROR_MONITORING_ENABLED=true`로 배포한다. production은 다른 전용 키로 반복한다. 브라우저 번들과 콘솔에 이 비밀값이 없는지 확인하고 키 회전 시 Edge와 양쪽 Vercel 환경을 함께 바꾼다. [Supabase Edge secrets](https://supabase.com/docs/guides/functions/secrets), [Vercel 환경변수](https://vercel.com/docs/environment-variables).

검증표:

1. 공개 web와 admin에서 각각 React 경계 오류, 미처리 promise, 서버 예외를 발생시켜 app/environment/release/수집 요청 ID·원래 요청 ID가 올바른지 확인한다. API 오류에는 `travel-api`의 원래 `X-Request-Id`, Next 서버 오류에는 앱이 발급한 `X-Travel-Request-Id`가 연결되는지 확인한다. 같은 fingerprint가 한 이슈로 묶이고 서로 다른 오류는 분리되는지 본다.
2. 토큰·쿠키·이메일·URL query·본문을 포함한 예외 메시지와 스택으로 브라우저 전송·Next 릴레이·Edge·DB·관리자 상세 응답·기본 로그를 각각 검사한다. 민감 내용이 남으면 수집 기능을 켜지 않는다. 마스킹 전 원문이 어느 경계에도 저장되지 않는지, 1,024/4,096자 제한과 16KiB 본문 상한을 시험한다.
3. 비로그인, 일반 독자, `editor`, `owner`, 권한 회수된 `admin`의 `admin.errors`와 `admin.error.get` 재요청이 거절되는지 실제 Auth로 확인한다. 허용된 admin만 개별 이슈와 최근 이벤트를 조회할 수 있어야 한다. `/error-analytics-preview`의 집계 차트와 `WEB-202`는 여전히 fixture이며, 실제 조회 영역과 구분한다.
4. 이벤트 폭주·중복·429·DB 장애에서도 비용 상한과 사용자 기능이 유지되는지, 정리 job과 5xx/급증 알림이 실제 담당자에게 도착하는지 확인한다.

#### 오류 상세 조회와 해결 처리 절차

[목록 HTML 시안](docs/previews/error-analytics.html)에서 `WEB-202`를 선택하면 [상세 HTML 시안](docs/previews/error-detail.html)을 볼 수 있다. 두 파일의 수치·제목·번호는 예시이며 상세 시안의 상태 버튼은 브라우저 안에서만 바뀐다.

**현재 코드:** `web_error_issues.status`에는 `open`·`resolved`·`ignored`가 있지만 상태를 바꾸는 관리자 API/UI는 없다. 새 `admin.error.get`은 활성 admin에게 해당 사이트 이슈와 최근 이벤트 20건의 마스킹된 메시지·스택을 반환한다. SQL의 `resolved` 이슈에 같은 fingerprint가 다시 들어오면 즉시 `open`으로 바꾸고, `ignored`는 새 발생 횟수만 늘린다. 재발 시각·처리자·해결 배포·사유는 기록하지 않으므로 이 상태만 보고 수정 완료나 재발 원인을 단정할 수 없다. 상세 migration과 Edge는 아직 원격에 적용하지 않았다.

**상세 화면의 데이터:** 이슈 ID, app/환경, 상태, 최초·최근 발생 시각과 누적 횟수, 오류 이름·고정 code(`message`)·경로 템플릿·source·fingerprint, 최근 수신 시각·release·마스킹된 `Error.message`와 stack, 안전한 파일/줄/열, 작업·의존 서비스·HTTP 상태를 보여준다. **수집 요청 ID**는 `travel-api`가 수집 호출에 발급한 값이고 **원래 요청 ID**는 실패한 API 응답 또는 앱의 Next 요청에서 온 값이다. 전자는 Supabase Edge 수집 로그, 후자는 같은 ID가 기록된 원래 API/Vercel 로그와 대조한다. 브라우저가 직접 보고한 ID는 위조 가능한 힌트다. 원본 URL·사용자 정보·요청 본문·마스킹 전 stack은 화면이나 DB에 추가하지 않는다. 이벤트 20건 이후의 페이지 이동, 기간별 추이, 마지막 해결 release, 상태 변경 이력은 아직 fixture 또는 후속 설계다.

1. **조사·수정:** 관리자는 수집 요청 ID로 Supabase Edge 수집 로그를 찾고 원래 요청 ID·발생 시각·경로·release로 실패한 API/Vercel 로그를 대조해 재현 조건을 기록한다. 같은 배포 산출물의 비공개 source map이 확보된 경우에만 파일·줄·열을 원본 코드 위치로 해석한다. 수정 배포 후 staging/production에서 같은 동작을 재검증한다. 오류가 더 이상 발생하지 않는다는 확인 전에는 `resolved`로 바꾸지 않는다. 의도한 동작 또는 조치하지 않을 문제는 정해진 사유 코드와 함께 `ignored`로 처리한다.
2. **상태 변경:** 후속 migration에서 `status_version`, `status_changed_at/by`, `resolved_at/by/release`, `ignored_at/by/reason`, `reopen_count`를 추가하고, 별도 비공개 `web_error_status_history`에 이전/새 상태·처리자(Auth user ID 또는 시스템)·시각·사유 코드·해결 release를 남긴다. 자유 서술 사유는 개인정보가 섞일 수 있으므로 초기에는 허용 목록 코드만 저장한다. 기존 `admin.error.get`은 이벤트 페이지 이동·이력까지 확장하고, 새 `admin.error.status`는 `site_id`, 이슈 ID, 목표 상태, 예상 `status_version`, 사유 코드, 해결 release만 받는다. Edge가 검증한 actor를 SQL에 전달하고 **매번 활성 admin membership을 확인**한다. 상태 변경·version 증가·이력 insert는 한 트랜잭션에서 수행하고, 동시 변경은 409로 돌려 최신 상태를 다시 읽게 한다. 비로그인 401, 다른 역할·권한 회수 403, 다른 사이트 이슈 404를 검증한다. 브라우저의 테이블/RPC 직접 접근은 허용하지 않는다.
3. **재발:** 해결 이후 같은 fingerprint가 다시 수집되면 현재처럼 `open`으로 재전환하되, 후속 구현에서는 `reopen_count`와 `system_reopened` 이력을 원자적으로 기록하고 마지막 해결 release와 새 이벤트 release를 비교해 표시한다. 오래 열린 탭이나 구버전 클라이언트의 보고일 수도 있으므로 자동 재개방을 곧바로 새 배포의 회귀로 단정하지 않는다. `ignored`는 자동으로 열지 않고 발생량 급증 시 재검토 대상으로 알린다. 다시 해결할 때는 재현·수정 확인과 새로운 해결 release를 남긴다.
4. **보존·검증:** 현재 정리 job은 없다. 공개 전 초기 정책으로 마스킹된 이벤트 상세를 최대 14일 보관하고 이슈의 `last_masked_*`도 같은 기간 뒤 비우며, 종료(`resolved`/`ignored`) 이슈와 상태 이력은 마지막 발생 뒤 180일 보관을 검토한다. 열려 있는 이슈는 해결까지 유지하되 용량 상한·장기 미처리 점검을 둔다. 이력의 actor ID는 오류 텔레메트리에는 넣지 않는 운영 감사 정보이므로 접근을 admin으로 제한하고 개인정보 보유·삭제 정책에 포함한다. 격리 staging에서 해결→동일 오류 재발, 무시→재발, 구 release 수신, 권한 회수, 동시 상태 변경 409, 이력 누락 없는 트랜잭션, 보존 job 및 삭제 후 목록·상세 응답을 확인한다.

### 8-2. GA4 웹 분석과 관리자 보고 화면

현재 `@repo/analytics`는 Firebase Analytics를 **동의 뒤에만** 초기화하고 `page_view`를 수동 전송하도록 만든다. 그러나 동의 버튼이 `apps/web/app/home-content.tsx`에만 있어 다른 페이지로 이동하면 컴포넌트가 unmount되어 페이지뷰가 누락될 수 있고, 동의 상태도 React state라 새로고침 때 사라진다. `NEXT_PUBLIC_ANALYTICS_ENABLED`가 꺼져 있거나 Firebase 환경변수가 없으면 실제 수집이 없다. GA4를 추가 설치하기 전에 이 배치를 공통 layout/provider로 옮기고 상태를 저장·재설정할 수 있게 해야 한다. [Firebase Analytics 웹 시작](https://firebase.google.com/docs/analytics/get-started?platform=web), [Google Consent Mode](https://developers.google.com/tag-platform/security/guides/consent).

1. **계정·환경:** 운영 GA4 property와 web data stream을 만들고 Firebase web app을 연결한다. 공개 Firebase config/`measurementId`를 production web 환경변수에 넣고 dev/preview에는 별도 property를 쓰거나 `NEXT_PUBLIC_ANALYTICS_ENABLED=false`로 비활성화한다. Google Analytics UI의 Realtime/DebugView 확인 계정을 정한다.
2. **동의 UX:** 최초 방문 시 기본 거부 상태에서 분석 목적·항목·보유/철회 방법을 보여준다. 동의/거부/철회 선택을 버전·시각과 함께 필요한 최소 first-party 저장소에 보존하고, footer 등 모든 페이지에서 바꿀 수 있게 한다. 동의 전에 Analytics SDK/요청·쿠키가 생성되지 않는지 실제 네트워크와 Storage로 확인한다. 광고 동의는 별도 선택이며 현재 `ad_storage`/`ad_user_data`/`ad_personalization`은 denied로 두는 방침이다.
3. **페이지뷰:** 공통 layout의 클라이언트 경로 변경 감시에서 최초 로드와 SPA 이동을 한 번씩 보낸다. 현재 SDK 설정의 `send_page_view:false`를 유지하고, GA4 enhanced measurement의 history/page 변화 자동 수집과 중복되지 않는지 확인한다. 이벤트에는 canonical path만 넣고 query/hash, 검색어, 이메일, 댓글/본문, 사용자 ID를 보내지 않는다.
4. **검증:** 새 방문, 동의, 거부, 재방문, 새로고침, 철회, web 글 3회 이동, 다른 탭을 테스트한다. Chrome 네트워크와 GA4 DebugView/Realtime의 이벤트 수를 대조하고 24시간 뒤 보고서 반영을 확인한다. 동의 철회는 향후 수집을 중단하는 것으로, 과거 데이터 삭제 요청은 별도 개인정보 절차로 다룬다.
5. **관리자 자체 통계(P1):** Google Cloud의 **Analytics Data API**를 켜고 해당 GA4 property에 읽기 권한만 가진 서비스 계정을 부여한다. Vercel admin 서버 전용 credential로 `runReport`를 호출해 최근 7/28일 사용자·세션·페이지뷰·상위 글·유입 채널·기기를 집계한다. 브라우저나 `NEXT_PUBLIC_*`, Supabase DB에 credential을 넣지 않는다. admin Auth/role을 서버에서 확인하고 metric/dimension/기간을 allowlist로 제한하며 5–15분 cache, quota/timeout/빈 결과 안내를 둔다. Data API는 보고용 집계이지 개별 방문 원본 로그 저장소가 아니다. [Data API 개요](https://developers.google.com/analytics/devguides/reporting/data/v1), [빠른 시작](https://developers.google.com/analytics/devguides/reporting/data/v1/quickstart), [쿼터](https://developers.google.com/analytics/devguides/reporting/data/v1/quotas).

개인정보 처리방침에는 운영 주체, 목적·항목, 보유기간, 제3자/국외 이전 여부, 철회·문의 방법을 실제 서비스 운영에 맞게 적는다. 국가별 광고/동의 요구사항은 출시 대상 지역을 확정한 뒤 최신 정책을 다시 확인한다. [개인정보보호위원회 처리방침 작성지침](https://pipc.go.kr/np/cop/bbs/selectBoardArticle.do?bbsId=BS074&nttId=12021).

### 8-3. 광고 수익화: AdSense와 Kakao AdFit — 출시 후 P1

`Google Ads`는 광고주가 구매할 때 쓰는 상품이다. 블로그가 광고를 **게재**해 수익을 받으려면 [Google AdSense](https://www.google.com/adsense/start/)와 [Kakao AdFit](https://adfit.kakao.com/info)을 검토한다. 현재 광고 script/slot/동의 UI가 없으므로 어느 매체도 연결·승인되지 않았다. 심사와 정책은 서비스·국가·시기에 따라 바뀌므로 신청 화면의 최신 요구사항을 따른다.

| 단계          | AdSense                                                                                                      | Kakao AdFit                                                               | 공통 검증                                                 |
| ------------- | ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------- | --------------------------------------------------------- |
| 사전 준비     | 독창적 공개 글, 소개·문의·개인정보 처리방침, 도메인 소유와 사이트 정책 확인                                  | 제휴 문의 → Kakao의 사전 승인/초대 → 인증코드로 가입, 계정·지급 정보 확인 | 사진 사용 권리, 모바일 본문 품질, 공개 URL 200            |
| 신청·연결     | AdSense에 사이트 추가 → 코드/메타 태그/`ads.txt`로 소유 확인 → 심사 요청. 승인 뒤 광고 코드와 `ads.txt` 유지 | 웹 매체·광고 단위 등록 → 심사용 script의 실제 광고 요청 확인 → 매체 심사  | 승인 전에는 광고가 보인다고 가정하지 않음                 |
| 배치          | web 공개 글/목록의 제한된 슬롯                                                                               | 같은 원칙으로 먼저 한 네트워크만 시범 운영                                | admin·로그인·계정·댓글 입력에는 미배치                    |
| 개인정보·품질 | 제공 지역에 따른 Google 인증 CMP/TCF 및 publisher 정책 검토                                                  | Kakao 정책과 쿠키/제3자 고지 확인                                         | 분석 동의와 광고 동의 분리, 철회, CLS/LCP·CSP·접근성 측정 |

광고를 첫 공개 필수 조건으로 잡지 않는다. 콘텐츠와 정책을 채운 후 한 매체를 먼저 신청하고 승인·동의·성능을 검증한다. EEA·영국·스위스에서 개인화 광고를 제공하면 Google의 인증 CMP 요구를 별도 확인한다. 광고 차단 사용자가 있어도 글을 읽을 수 있어야 한다. [AdSense 사이트 연결](https://support.google.com/adsense/answer/7584263), [AdSense `ads.txt`](https://support.google.com/adsense/answer/12171612), [AdSense 프로그램 정책](https://support.google.com/adsense/answer/48182), [AdSense publisher consent](https://support.google.com/adsense/answer/13554116), [AdFit 안내](https://adfit.kakao.com/info), [AdFit FAQ](https://kakaobusiness.gitbook.io/main/partner/adfit/faq).

### 8-4. 보안·복구 운영 기준

- **인증과 비밀값:** Supabase `sb_secret_...`/legacy service role, Google 서버 credential, Cron secret은 Vercel 서버/보호된 CI secret에만 둔다. `NEXT_PUBLIC_*`에는 공개해도 되는 URL·publishable key·Firebase 웹 설정만 둔다. preview와 production 자격을 분리하고 외부 fork preview에 production secret을 주지 않는다. Auth/role은 모든 쓰기와 관리자 조회 요청에서 서버 재검증한다.
- **HTTP와 입력:** HTTPS, HSTS, CSP, `frame-ancestors`, `X-Content-Type-Options`, `Referrer-Policy`와 최소 Permissions Policy를 적용한다. Kakao/Supabase/Google/광고 도메인은 실제 기능별 CSP allowlist로 관리한다. 변경 요청의 Origin/CSRF 특성, 크기·형식·rate limit·429 처리, 공개 오류 ingest 남용을 시험한다.
- **파일과 백업:** MIME뿐 아니라 콘텐츠 서명, 크기·픽셀·페이지 제한을 변환 실행에서 재검증한다. private Storage의 signed URL 만료·참조 fencing·7일 격리·Storage API 삭제를 staging에서 시험한다. DB snapshot/PITR 여부와 Storage 객체의 별도 복구 방법, 실제 restore 시간·담당자를 적는다.
- **공급망과 사고:** lockfile을 고정하고 lint/type/test/build/config/secret scan을 main merge gate에 둔다. MFA와 최소 콘솔 권한을 적용한다. 키 유출·권한 회수·5xx 급증·큐 정체·DB/Storage 장애별 차단→롤백→복구 순서를 정한다. 운영 데이터의 삭제 실험은 하지 않는다. [Supabase 보안 안내](https://supabase.com/docs/guides/security), [Vercel 환경변수](https://vercel.com/docs/environment-variables).

2026-10-07 Supabase Security Advisor를 migration 적용 전후에 조회했다. 새 오류 테이블 관련 경고는 없었다. 기존 `app_private.owner_bootstrap_targets`의 RLS 정책 없음(INFO)은 의도된 비공개·직접 접근 차단인지 권한과 함께 확인하고, Auth의 leaked-password protection 비활성(WARN)은 비밀번호 로그인 사용 범위와 설정 가능 여부를 검토한다. 이것을 새 migration의 오류로 단정하지 않는다.

## 9. Vercel + Supabase 통합 QA와 자동 배포 — P0

### 9-1. 배포 대상과 현재 차이

| 대상                | 첫 배포 목표                                            | 현재 코드/연결 상태                                                                                                               |
| ------------------- | ------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| 공개 web `apps/web` | Vercel Project A, 공개 canonical 도메인                 | Next.js 앱/monorepo build 존재; Vercel 프로젝트·실도메인 연결은 검증되지 않음                                                     |
| 관리자 `apps/admin` | Vercel Project B, 별도 도메인·접근 보호                 | Next.js 앱과 Auth role 검사 존재; Vercel 연결/운영 접근 정책은 미검증                                                             |
| Supabase SaaS       | staging/production 분리 DB/Auth/Storage/`travel-api`    | 기존 `travel-blog` DB migration 33개·Edge v19. 신규 staging DB 33개·Edge v1과 SQL/HTTP 검증 완료. 운영 Edge 오류 수집 코드 미배포 |
| 미디어 작업         | Supabase queue + Vercel Cron → Node Function의 1회 처리 | staging SQL claim·lease 검사 통과. 보호된 Function/Cron은 로컬 코드이며 Preview native 변환 미검증                                |
| CI                  | Git 보호 브랜치와 검증, Supabase 별도 배포 job          | GitHub 원격·첫 기능별 PR 연결. CI/브랜치 보호·Vercel 자동 배포는 아직 검증되지 않음                                               |

2026-10-07에는 원격 Git과 Vercel 프로젝트가 없었다. 2026-10-08에 GitHub 원격을 연결하고 기능별 변경을 PR로 올렸지만, 연결된 Vercel 계정에는 아직 `travel-blog` web/admin 프로젝트가 보이지 않는다. 같은 저장소를 **별도 두 Vercel Project**에 연결하고 각 Root Directory를 `apps/web`, `apps/admin`으로 둔다. workspace root의 `pnpm-lock.yaml`, 공유 패키지, Node 24와 빌드 산출물이 두 프로젝트 preview에서 재현되는지 확인한다. ignored build 규칙은 공유 패키지 변경을 놓치지 않는 것을 먼저 확인한 후 적용한다. [Vercel monorepo](https://vercel.com/docs/monorepos), [Turborepo](https://vercel.com/docs/monorepos/turborepo).

### 9-2. Docker polling worker를 Vercel Function으로 옮기는 순서

현재 1·2단계는 로컬 코드, 큐/삭제 lease 보정은 신규 staging SQL 테스트까지 완료했다. 3–5단계의 실제 Vercel 연결과 파일 종단 검증은 남아 있다. [환경변수·테스트·중지/복구 절차](docs/media-worker-vercel-supabase.ko.md).

1. **로컬 구현:** `@repo/media-worker`의 변환·다운로드·완료/실패 로직을 **한 번 claim→최대 한 작업 처리→종료** 함수로 분리했다. 장기 polling loop와 Docker 전용 실행은 fallback으로 남겼다. 같은 production queue의 두 실행기를 동시에 켜지 않는다.
2. **로컬 구현:** `apps/admin`에 보호된 Node Function `GET /api/internal/media-worker`와 `apps/admin/vercel.json`의 매분 Cron을 추가했다. `CRON_SECRET`을 검사한 뒤 `TRAVEL_MEDIA_WORKER_ENABLED=true`에서만 서버 전용 Supabase secret으로 RPC를 호출한다. 업로드 본문은 Function을 통과시키지 않고 브라우저→Supabase Storage signed upload를 유지한다. Function은 큐 자산을 Storage에서 읽고 결과도 Storage에 쓴다.
3. **Preview 필요:** `sharp`, `pdfjs-dist`, `@napi-rs/canvas`의 Linux native 번들·파일 tracing·메모리·임시 디스크·함수 크기·실행시간을 실제 20MB PDF/고화질 이미지로 측정한다. 큐 lease는 5분, Function `maxDuration`은 240초, 네트워크 요청 timeout은 30초다. 실패·중단 시 재시도와 시도별 저장을 점검한다. [Vercel Function 제한](https://vercel.com/docs/functions/configuring-functions/duration).
4. **Preview/운영 검증 필요:** 신규 staging에 migration을 전부 재생하고 `process_asset`만 claim하며 만료된 삭제 lease를 재획득하는 rollback SQL은 통과했다. Vercel Preview에서는 보호된 Function을 직접/CI로 반복 호출해 겹침·실패·재시도·적체를 검사한다. 실제 Vercel Cron 스케줄러는 production deployment에서만 호출되므로 배포 후 제한된 canary 작업으로 전달·누락·중복을 별도 확인한다. Cron을 정확히 한 번 실행 보장으로 취급하지 않고 DB lease/중복 방지를 유지한다. Vercel Hobby Cron은 하루 1회이므로 현재 매분 설정은 Pro 이상이 필요하다. [Cron 호출 대상](https://vercel.com/docs/cron-jobs), [Cron 주기·요금](https://vercel.com/docs/cron-jobs/usage-and-pricing), [Cron 관리/실패](https://vercel.com/docs/cron-jobs/manage-cron-jobs).
5. **종단 검증 필요:** 이미지/PDF ready, 실패 후 backoff, 7일 격리, 참조 중 삭제 차단, Storage API 실패 재시도, lease 만료를 격리 staging에서 통과시킨다. production Cron canary 전에 polling 컨테이너를 중지한다. Supabase `storage.objects` 직접 SQL 삭제는 사용하지 않는다. Function 비용·실행량·큐 대기시간을 첫 주 집중 관찰한다. 현재 1분에 최대 한 작업을 처리하므로 유입량이 이를 넘거나 자산이 계속 쌓이면 정리가 밀릴 수 있다.

Node Function에서 변환 시간/번들/메모리 제한을 통과하지 못하면 억지로 Edge Function으로 옮기지 않는다. 별도 Docker host는 이때의 명시적 fallback이며, 지금의 **목표 구조**에 포함하지 않는다. Supabase Edge Function은 이미지/PDF native 변환의 안전한 일괄 대체로 가정하지 않는다.

### 9-3. 환경변수·도메인·배포 순서

| 범위                    | 필요한 값과 설정                                                                                                                                                                                  | 주의                                                                                                                         |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| web Vercel Production   | `TRAVEL_API_MODE=supabase`, `NEXT_PUBLIC_API_MOCKING=disabled`, `NEXT_PUBLIC_SITE_URL=https://<blog-domain>`, Supabase URL/publishable key, Firebase 공개 웹 설정·`NEXT_PUBLIC_ANALYTICS_ENABLED` | public 변수는 빌드 산출물에 들어간다. GA와 오류 수집 flag는 종단 검증 뒤 켠다.                                               |
| admin Vercel Production | 동일 API mode, **admin 도메인**의 `NEXT_PUBLIC_SITE_URL`, 같은 production Supabase URL/publishable key                                                                                            | 관리자만 사용하는 Google Data API credential·Cron/service secret은 server-only 환경변수로 제한한다.                          |
| Preview 두 프로젝트     | 별도 staging Supabase URL/publishable key, preview origin, analytics/ads disabled, 오류 환경 `preview`                                                                                            | fork PR secret 노출 차단; preview에서 production DB 쓰기 금지. OAuth를 시험할 고정 preview 도메인만 allowlist.               |
| Supabase SaaS           | Auth Kakao provider, URL allowlist, CORS origin, site bootstrap, migrations, `travel-api`, private Storage, queue                                                                                 | 실제 대시보드의 migration history와 `supabase/deployment.json`을 대조한다. service secret은 Edge와 보호된 Function에만 둔다. |
| CI/운영                 | migration 배포 권한, Vercel 연결, Cron secret 회전, 백업/알림 수신자                                                                                                                              | 원격 토큰을 Git·문서·브라우저에 저장하지 않는다.                                                                             |

`scripts/run-app.mjs`는 로컬 모드 script용이며, Vercel 빌드에서 production mode·공개 변수가 실제로 적용되는지 **preview deployment**에서 확인해야 한다. 두 프로젝트의 Root Directory, Install/Build command, Node/pnpm 버전, workspace 바깥 공유 package 포함을 먼저 검증한다. 로컬 `pnpm build:supabase` 성공만으로 Vercel build를 통과했다고 쓰지 않는다.

권장 릴리스 순서:

1. 연결된 원격 Git의 `main` 보호/PR 필수 검사를 확인 → 생성한 staging Supabase project와 두 Vercel Preview 프로젝트 연결. Vercel Git integration은 아직 연결해야 한다.
2. 빈 격리 staging에서 migration 전부 재생, SQL/계약/권한 테스트 → staging `travel-api` 배포 → `deployment.json`과 실제 migration/Edge 버전 대조. 실패 시 production 배포 중단.
3. staging Supabase를 사용하는 Vercel Preview web/admin과 미디어 1회 Function을 배포하고 Function은 보호된 경로를 직접 호출해 검증한다. Auth·Storage·queue·오류 수집·SEO·분석 동의까지 아래 테스트를 통과시킨다. 실제 Cron delivery는 production canary에서 별도 검증한다.
4. 호환되는 **확장형 migration → Edge Function → Function/Cron → web/admin** 순으로 production을 배포한다. breaking schema는 구버전 앱 호환 기간을 둔 후 정리한다. production DB reset이나 bootstrap 테스트 fixture를 실행하지 않는다.
5. 운영 smoke/알림/비용 확인 후 이전 release 롤백과 DB restore 절차를 리허설한다. Supabase 스키마가 변경된 뒤 Vercel만 롤백하면 예전 앱이 새 DB와 호환되는지도 확인한다.

Vercel은 web/admin Git 자동 배포와 Cron/Function을 맡지만 Supabase migration·Edge 배포까지 자동 대체하지 않는다. Supabase CLI를 쓰는 별도의 승인된 CI job 또는 수동 운영 절차가 필요하다. Vercel Hobby는 개인적·비상업적 이용 제한이 있고 Cron도 하루 1회여서, 광고 수익화와 빠른 미디어 처리 목표라면 Pro와 함수 사용량을 기준으로 예산을 검토한다. Supabase paid plan, Storage/egress, backup/PITR도 실제 보존 목표를 기준으로 산정한다. [Vercel Hobby](https://vercel.com/docs/plans/hobby), [Vercel 가격](https://vercel.com/pricing), [Supabase 가격](https://supabase.com/pricing).

| 선택                                              | 운영 이점                                                             | 추가 부담·재검토 조건                                                                                     |
| ------------------------------------------------- | --------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Vercel + Supabase SaaS (현재 권장)                | 두 Next 앱의 preview/CDN/배포와 Auth/DB/Storage/API를 관리형으로 분담 | 별도 Supabase 배포 job, Function 비용·Cron 주기, 두 서비스의 로그/사용량 확인                             |
| AWS Amplify + Supabase                            | AWS 청구/계정 표준을 이미 쓰는 경우 통합 가능                         | 현재 Next 버전·monorepo 호환성 재검증, Supabase/Function·백업 운영은 계속 필요                            |
| AWS SSR compute/CDN + Supabase 또는 AWS 전체 이전 | 네트워크·컴퓨트·로그 통제를 세밀하게 설계 가능                        | SSR/CDN/인증/DB/Storage/배포·복구를 직접 조립·운영. 전담 운영 역량과 구체적 비용/규제 요구가 있을 때 검토 |

같은 30일 요청량·이미지/PDF 처리량·전송량·함수 실행시간·로그 보관기간으로 비용표를 만들어 비교한다. 예산 상한 초과가 지속되거나 데이터 지역·private networking·감사 요구가 현재 구성에서 충족되지 않을 때 AWS를 다시 평가한다. [AWS Amplify 가격](https://aws.amazon.com/amplify/pricing/), [AWS Fargate 가격](https://aws.amazon.com/fargate/pricing/).

### 9-4. sitemap·robots·Search Console·preview noindex 검증

현재 `apps/web/app/sitemap.ts`는 `/`, `/posts`, `/about`, `/notice`와 공개 API 글 목록의 sitemap을 동적으로 만든다. API 실패 시 **정적 4개 경로만 조용히 반환**하므로 글 URL 누락을 오류 관측/알림에 연결해야 한다. `robots.ts`는 공개 페이지 허용, `/api/`·`/auth/`·`/login` 제외와 sitemap 주소를 만든다. `NEXT_PUBLIC_SITE_URL` 누락 시 localhost 주소가 들어간다.

1. 고정 production HTTPS 도메인을 web의 `NEXT_PUBLIC_SITE_URL`과 DNS/TLS에 지정한다. preview/staging 도메인을 canonical·OG·sitemap에서 production처럼 발표하지 않는다. 필요하면 preview 배포에는 인증 접근 보호와 `X-Robots-Tag: noindex` 또는 페이지별 robots metadata를 사용한다. **`robots.txt`의 disallow만으로 비공개·검색 제거를 보장하지 않는다.** [Google robots 안내](https://developers.google.com/search/docs/crawling-indexing/robots/intro), [Vercel Deployment Protection](https://vercel.com/docs/deployment-protection).
2. 운영 `/sitemap.xml`에서 host·절대 URL·인코딩·`lastModified`·게시 상태를 확인한다. 발행→수정→비공개/삭제 각각 뒤 결과를 다시 받아 발행 글만 포함되는지 검사한다. 50,000 URL 또는 압축 전 50MB를 넘으면 sitemap index/분할을 계획한다. API 실패 때 빈 글 목록을 정상으로 오해하지 않도록 측정한다. [Google sitemap 가이드](https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap).
3. `/robots.txt`가 운영 sitemap을 가리키고 공개 글 접근을 허용하는지, 관리자 도메인에는 `noindex`와 인증/권한 통제가 모두 적용되는지 확인한다. 익명 사용자의 admin HTML/데이터, 초안 URL, 비공개 asset 접근은 직접 401/403/404를 반환해야 한다. `noindex`는 보안 장치가 아니다.
4. [Search Console](https://search.google.com/search-console/about)에서 DNS TXT로 도메인 소유를 확인하고 sitemap을 제출한다. URL 검사/페이지 색인 보고서에서 공개 글 하나의 200·canonical·색인 상태를 확인한다. 비공개 전환 글은 404/권한 거절로 바뀌는지 확인한다. sitemap 제출은 발견 힌트이며 색인을 보장하지 않는다. [Sitemap 보고서](https://support.google.com/webmasters/answer/7451001).
5. 실제 브라우저/`curl -I`·HTML에서 production 공개 200, admin/preview `noindex` 또는 접근 보호, 초안/삭제 404, API 및 signed asset 권한 거절을 각각 검사한다. robots와 meta/header 결과가 서로 충돌하지 않는지도 본다. 운영 글의 제목·설명·OG 이미지·canonical·모바일 속도를 함께 확인한다.

### 9-5. Kakao 두 단계 callback·로그아웃·권한 시험

OAuth에는 **서로 다른 두 redirect 단계**가 있다. Kakao Developers의 REST API 키 설정에는 Supabase가 제시하는 `https://<project-ref>.supabase.co/auth/v1/callback`을 등록한다. Kakao REST API key를 client ID로, 활성화한 Kakao Login Client Secret을 Supabase Kakao provider의 secret으로 넣고 Kakao Login ON/동의 항목을 확인한다. 로컬 Supabase CLI Auth를 쓰는 별도 프로젝트라면 `http://localhost:54321/auth/v1/callback`을 Kakao에 따로 등록한다. 실제 원격 Supabase에 연결한 localhost web/admin만 테스트할 때는 Kakao의 등록 대상이 **원격 Supabase callback**이다. [Supabase Kakao 안내](https://supabase.com/docs/guides/auth/social-login/auth-kakao).

두 번째 단계는 Supabase Authentication → URL Configuration의 **Redirect URLs allowlist**다. 여기에 web `https://<blog-domain>/auth/callback`과 admin `https://<admin-domain>/auth/callback`, 필요한 고정 staging 주소를 각각 등록한다. `Site URL`은 fallback일 뿐 두 앱 callback을 대신하지 않는다. 개발에 쓰는 `http://localhost:3000/auth/callback`과 `http://localhost:3002/auth/callback`은 개발용으로만 유지한다. 앱의 `signInWithOAuth({ provider:'kakao', options:{ redirectTo } })`가 자기 도메인 callback을 보내고, route가 code를 session으로 교환한다. [Supabase Redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls).

검증은 web 독자/관리자 계정 각각에서 로그인→원래 페이지 복귀→새로고침 세션 유지→로컬 로그아웃→보호 페이지 재요청을 수행한다. admin은 Kakao identity와 활성 `site_memberships` role을 다시 확인한다. 로그인 취소, 잘못된 redirect, 만료 code/session, 권한 없는 계정, role 회수 후 기존 화면에서 새 요청을 보내는 경우를 포함한다. 앱 로그아웃은 현재 Supabase `signOut({ scope:'local' })`이므로 **Kakao 계정 자체 로그아웃까지 의미하지 않는다.** web/admin의 도메인이 달라지면 localhost와 쿠키 공유 방식이 달라질 수 있어 각 앱 세션 종료를 따로 검사한다. callback에 토큰·OAuth code를 로그로 남기지 않는다.

### 9-6. 통합 QA·보안 통과 조건

- [ ] 기존 CI에 계약·권한·저장/충돌·댓글·홈 적용 브라우저 테스트를 연결한다. SQL·Edge·Node 미디어 Function 검증은 별도 격리 backend에서 실행한다.
- [ ] staging에서 owner/일반 독자·비회원으로 실제 로그인→사진/PDF signed upload→queue→ready→저장→발행→공개 열람→비공개/삭제를 검증한다. `pnpm test:supabase`는 읽기 전용 smoke이며 이 종단 시험의 대체가 아니다.
- [ ] 만료 세션·느린 네트워크·중복 제출·업로드 중단·권한 회수·signed URL 만료·Function 중단/겹침·Storage 삭제 실패/lease 재시도를 시험한다.
- [ ] CORS/redirect allowlist, mutating API Origin/CSRF, 비밀값 노출·공개 bundle/source map, CSP와 HTML/link 렌더링을 확인한다.
- [ ] 실제 사진으로 모바일 전송량·LCP/CLS·키보드/스크린리더·대비·reduced motion을 확인하고 부모님이 작성·수정·사진 추가·발행·댓글 답글을 직접 수행하게 한다.
- [ ] staging·production 각각의 DB migration history, `travel-api` 버전, Function release, Vercel web/admin 배포 ID와 변경 결과를 한 릴리스 기록으로 남긴다.

## 10. 운영 배포와 공개 — P0

- [ ] 운영 도메인·TLS·Supabase URL/CORS·Kakao의 Supabase callback 및 각 앱 callback·logout·canonical을 적용한다.
- [ ] 운영 Supabase의 migration history·Edge 버전과 파일 목록을 대조해 필요한 변경만 적용한다. production DB reset은 하지 않는다.
- [ ] queue/Function 호환성을 확인한 뒤 운영 web/admin 두 Vercel 프로젝트를 배포하고 mock 비활성, 미리보기/관리자 접근 통제를 검증한다.
- [ ] 실제 도메인에서 로그인·글/이미지/PDF·댓글·관리자 role·오류 수집·GA 동의/철회·sitemap/robots/noindex를 smoke 검증한다. 제거한 `/playground`가 404인지 확인한다.
- [ ] 대표 글·사진·소개·정책·문의 정보를 실제 콘텐츠로 채우고 샘플 데이터를 제거한다.
- [ ] 공개 직후 오류율·API 5xx/429·미디어 queue 지연/실패·Storage 전송량·Vercel 함수 사용량과 비용을 집중 확인한다. 담당자/연락 경로와 공개 중단·롤백 기준을 실제로 적용한다.

### 공개 승인 게이트

- [ ] 실제 owner가 로그인하고 사진 여러 장을 포함한 초안을 저장·재접속·수정·발행할 수 있다.
- [ ] 비회원이 글과 이미지를 열람하고, 오래 열린 페이지에서도 signed URL 갱신으로 이미지가 보인다.
- [ ] PDF 업로드·변환·열람이 성공하며 PDF 글에는 댓글/좋아요가 제공되지 않는다.
- [ ] 회원/비회원 댓글과 관리자 숨김, 일반 글의 좋아요가 동작한다.
- [ ] 비공개/삭제 글은 공개 경로에서 차단되고 파일 접근은 문서화한 만료 정책을 따른다.
- [ ] admin 권한 없는 계정의 관리자 데이터/쓰기와 `admin.errors` 접근이 서버에서 거절된다.
- [ ] 자체 오류 DB·API 수집/조회·민감정보 제거·알림, GA 분석 동의/철회, 큐 장애 복구, DB/Storage restore를 staging에서 검증했다.
- [ ] sitemap/robots/Search Console 제출, preview/admin noindex·접근 보호, Kakao 두 callback과 로그아웃을 운영 도메인에서 확인했다.
- [ ] 부모님 사용성 검수와 배포 롤백 리허설을 통과했다.

## 첫 공개 이후 확장 후보 — P2

P2는 이번 배포를 늦추지 않기 위한 단계 구분이다. 최초 요구 범위를 삭제한다는 뜻은 아니며 공개 필수로 결정되면 P1로 올린다.

- [ ] 관리자에 GA4 Data API 7/28일 방문 통계, 자체 오류 이슈, Supabase queue·Storage 지표를 한 화면에 모은다. 관리자 오류 분석 `/error-analytics-preview` 시안은 실제 API 연결·권한 검증 전에는 fixture 화면으로 표시한다.
- [ ] 이메일/푸시 없는 간단한 운영 알림에서 시작해 오류 급증·미디어 실패·권한 변경의 알림 규칙과 담당자 확인/해결 상태를 고도화한다.
- [ ] 실제 편집 데이터의 인기도를 보고 글 예약 발행·편집자 검토/승인·발행 전 링크/이미지 누락 검사를 추가한다.
- [ ] 독자가 글을 저장해 다시 보는 북마크, 연관 여행 경로/지도, 접근성 있는 사진첩을 수요 순으로 검토한다.
- [ ] 댓글 이미지 첨부·이메일 알림, 검색 자동완성, 다국어/번역은 개인정보·moderation·운영비를 검토한 뒤 도입한다.
- [ ] GA/광고는 승인·동의·성능 자료가 준비되면 한 네트워크부터 시범 적용한다. `ads.txt`, CLS/LCP, 광고 차단 환경을 확인한다.
- [ ] 사용성 검증을 바탕으로 사진첩·책갈피·페이지 전환 등 여행책 세부 motion을 추가한다. 기본 반응형·접근성은 첫 공개 범위다.
- [ ] 실제 전송량 측정에 따라 480/960px 이미지 파생물과 캐시를 최적화한다. 현재 1600px 이미지가 성능 기준을 만족하지 못하면 공개 전으로 앞당긴다.

## 바로 다음에 진행할 순서

1. **staging Supabase 정합성:** 최신 migration 33개·`travel-api` v1 적용과 SQL/HTTP·실제 JWT 권한 검증을 마쳤다. MCP가 생성한 원격 버전 32개를 공식 절차로 정합화하기 전에는 staging `db push`를 쓰지 않는다. 실제 owner Kakao 가입과 파일 종단 검증은 남아 있다. [staging 기록](supabase/STAGING.ko.md). 기존 `travel-blog` DB는 reset하지 않는다.
2. **미디어 Vercel 이행:** 구현한 단일 작업 Function과 새 migration을 격리 staging/Vercel Preview에 적용해 native image/PDF 번들, 제한, 실패·lease·Storage 삭제 재시도를 통과시킨다. 실제 Cron은 production canary로 확인하고, 통과 전에는 Docker fallback만 한 실행기로 유지한다.
3. **두 앱 preview와 도메인:** 이미 연결된 원격 Git을 Vercel web/admin 프로젝트와 연결하고 staging Supabase만 주입한다. 카카오 redirect 두 단계, GA 동의 배치, 오류 수집, sitemap/noindex, 권한 회수를 preview에서 검증한다.
4. **운영 정책과 릴리스:** 개인정보·광고 정책, 백업/복원, 알림 담당자와 비용 상한을 정한 뒤 production 배포 순서와 rollback을 연습한다.

라이브러리 설치나 HTML 시안은 제품 기능·원격 배포 완료를 의미하지 않는다. 실제 수집·변환·권한·복구의 증거가 공개 판단 기준이다.

## 검증 명령과 근거

| 명령                    | 확인 범위                                                         |
| ----------------------- | ----------------------------------------------------------------- |
| `pnpm check`            | lint·타입·단위·환경 설정·포맷                                     |
| `pnpm test:mock`        | 단위 테스트와 Mirage 브라우저 시나리오                            |
| `pnpm test:e2e`         | 기존 앱 smoke 테스트                                              |
| `pnpm test:supabase`    | 실제 Auth 설정·Edge 상태·사이트/공개 글 읽기 전용 확인            |
| `pnpm test:staging:api` | 고정된 신규 staging Edge의 공개 조회·무인증 거절·방문자 서명 검사 |
| `pnpm build:supabase`   | 선택한 실제 연결 profile로 운영 빌드                              |
| `pnpm start:supabase`   | 해당 운영 빌드 실행                                               |

2026-10-06 `pnpm test:supabase`는 당시 샌드박스 네트워크에서 `fetch failed`였다. 2026-10-08 명시적 staging URL의 HTTP 검사 3개는 네트워크가 허용된 실행에서 통과했다. 앞의 읽기 전용 검사는 OAuth/쓰기/업로드/운영 배포 검증을 대신하지 않는다.

- [프로젝트 실행·패키지 구조](README.md)
- [Supabase 구축 상태와 남은 운영 연결](supabase/README.ko.md)
- [실제 API 명세](supabase/API.ko.md)
- [Mirage 지원 범위와 제약](packages/mock-api/README.md)
- [인증 로컬 검증 기록](AUTH-VERIFICATION.ko.md)

화면 기준은 로컬 `DESIGN.md`와 `docs/design`의 최신 다섯 분류·홈 템플릿·댓글 명세다. 현재 `docs/`는 Git 제외 대상이므로 팀과 CI가 참조할 최종 디자인 기준은 추적 가능한 위치나 공유 문서로 별도 정리해야 한다.
