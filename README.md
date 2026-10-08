# 오늘도 함께 걷다

부모님 여행 블로그의 pnpm + Turborepo 기반 모노레포입니다. Node 24, pnpm 11.25.0을 사용합니다.

첫 공개의 검증 범위와 완료 기준은 [통합 QA 기록](docs/RELEASE-QA.ko.md)과 [운영 배포 기록](docs/PRODUCTION-RELEASE.ko.md)을 참고하세요. 날짜별 개인 개발 로드맵은 로컬에서만 관리합니다.

owner·Kakao·로그아웃·권한 회수 및 과거 격리 DB 재생의 검증 범위는 [staging 기록](supabase/STAGING.ko.md)에 정리했습니다. `travel-blog-staging`은 과거 검증 기록이며 현재 배포 대상이 아닙니다. 개인 계정의 검증 기록은 로컬에만 보관합니다.

## 실행 모드

| 명령                         | 동작                                                                      |
| ---------------------------- | ------------------------------------------------------------------------- |
| `pnpm dev` / `pnpm dev:mock` | MirageJS 개발 환경. 실제 Supabase 키·URL을 비우고 mock을 강제로 켭니다.   |
| `pnpm dev:supabase`          | 실제 Supabase SaaS 연결. 두 앱의 키를 먼저 검사하고 mock을 강제로 끕니다. |
| `pnpm test:mock`             | 단위 테스트 + Mirage 브라우저 테스트. 실제 SaaS를 호출하지 않습니다.      |
| `pnpm test:supabase`         | 실제 Auth 키·Edge 상태·사이트·공개 글을 읽기 전용으로 검사합니다.         |
| `pnpm build:supabase`        | 실제 연결 설정을 읽어 두 앱의 운영 빌드를 만듭니다.                       |
| `pnpm start:supabase`        | 위 운영 빌드를 실행합니다. 공개 환경 변수 변경 후에는 다시 빌드하세요.    |

### Mock으로 개발

```sh
pnpm install --frozen-lockfile
pnpm dev:mock
```

블로그는 http://localhost:3000, 관리자는 http://localhost:3002 입니다. 두 앱의 `/mock`에서 예시 API를 체험합니다. 실제 글 작성과 저장·발행은 관리자 `/write`에서 진행합니다.

### 실제 Supabase로 개발

```sh
cp .env.supabase.example .env.supabase.local
# .env.supabase.local의 NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY 입력
pnpm test:supabase
pnpm dev:supabase
```

루트의 `pnpm dev:supabase`는 두 앱을 함께 실행합니다. 블로그는 http://localhost:3000, 관리자는 http://localhost:3002 에서 확인할 수 있으며 소스 변경이 바로 반영됩니다.

앱 하나만 실행하려면 루트에서 다음 명령을 사용하세요.

```sh
pnpm --filter web dev:supabase
pnpm --filter admin dev:supabase
```

각 앱 디렉터리(`apps/web`, `apps/admin`)에서는 `pnpm dev:supabase`로 실행할 수 있습니다. `pnpm start`는 이전 운영 빌드를 실행하므로 개발 중에는 `dev:supabase`를 사용하세요. 실제 연결의 운영 결과를 확인하려면 `pnpm build:supabase` 후 `pnpm start:supabase`를 실행하세요.

공통 URL·publishable key는 루트 `.env.supabase.local`에서 읽습니다. 단일 원격 프로젝트 정책에 따라 web/admin의 로컬 실제 연결, Vercel Preview, Production을 모두 `travel-blog`로 전환할 예정입니다. Vercel 환경변수 전환은 아직 완료되지 않았습니다. 예제 파일은 프로젝트 URL을 비워 두므로 [운영 배포 식별자](supabase/deployment.json)의 프로젝트 URL과 해당 프로젝트 publishable key를 설정하세요. 서비스별/앱별 값은 `apps/web/.env.supabase.local`, `apps/admin/.env.supabase.local`에서 재정의할 수 있습니다. 실제 연결에서 저장·발행·삭제·업로드하면 운영 데이터가 바뀝니다. 반복·파괴적 테스트는 mock이나 별도 로컬/격리 테스트 backend를 사용하세요.

우선순위는 **셸 환경 변수 > 앱별 profile > 루트 profile**입니다. 값은 `$VARIABLE` 참조 없이 직접 입력하세요. 선택한 실행 명령은 `NEXT_PUBLIC_API_MOCKING` 값을 항상 덮어쓰므로 `.env.local`이나 셸에 남은 플래그 때문에 모드가 뒤바뀌지 않습니다. 기존 `.env.local`의 Supabase 연결 값은 profile 파일로 옮겨 주세요. Next는 그 외 일반 환경 변수를 기존 방식으로 읽습니다.

실제 모드는 필수 값이 없거나 비밀 키를 공개 키 자리에 넣으면 실행 전에 종료합니다. `test:supabase`는 로그인·쓰기·업로드·DB 초기화를 하지 않으며, OAuth 사용자 흐름이나 RLS 전체를 검증하는 테스트는 아닙니다. CI는 실서비스 자격 정보 없이 `pnpm check`, `pnpm build`, 일반 smoke E2E와 mock E2E를 실행합니다. `pnpm build`는 연결 없이 컴파일을 확인하는 기존 명령으로 유지했습니다. 실제 배포 설정으로 빌드하려면 `build:supabase`를 사용하세요.

두 개발 모드는 같은 포트를 사용합니다. 실행 중인 서버를 종료한 뒤 다른 모드로 전환하세요. `/write`는 실제 로그인과 해당 사이트 owner/admin/editor 권한이 필요하며 mock 역할로 서버 인증을 우회하지 않습니다.

## 구조

| 경로                         | 역할                                                                 |
| ---------------------------- | -------------------------------------------------------------------- |
| `apps/web`                   | Next.js 공개 블로그, 포트 3000, Firebase 동의 UI                     |
| `apps/admin`                 | Next.js 관리자, 포트 3002, 인증·권한 검사, 에디터                    |
| `packages/ui`                | shadcn 방식의 Radix Button, cn, Tailwind v4 테마, components.json    |
| `packages/constants`         | 브랜드·다섯 카테고리·권한·PDF 반응 규칙                              |
| `packages/contracts`         | Zod API 입력 및 응답 검증                                            |
| `packages/database`          | 기존 생성 DB 타입, Supabase browser/server/proxy 클라이언트          |
| `packages/api-client`        | Axios travel-api 클라이언트, 오류 타입, TanStack Query provider/keys |
| `packages/editor`            | 한국어 BlockNote + shadcn, 클라이언트 전용 편집/미리보기             |
| `packages/observability`     | 자체 오류 수집 봉투·서버 릴레이·민감 정보 최소화                     |
| `packages/analytics`         | 동의 기반 Firebase Analytics 초기화·페이지뷰                         |
| `packages/eslint-config`     | ESLint flat config, TypeScript/React/Next 규칙                       |
| `packages/typescript-config` | 공통 TypeScript 설정                                                 |
| `supabase`                   | 기존 migration·Edge Function·DB 타입·SQL/worker 테스트               |
| `e2e`                        | Playwright 공개 홈/한국어 편집·미리보기 테스트                       |

기존 `apps/docs` 템플릿은 보존하되 workspace 실행 대상에서 제외했습니다.

앱 → 기능 패키지 → 공통 설정/상수 방향으로 의존합니다. 공개 web은 BlockNote를 import하지 않습니다. 일반 요청은 공개 Supabase 키와 사용자 세션을 사용하며 service-role 키는 앱에 필요하지 않습니다. 별도 API 서버 대신 앱의 Route Handler와 기존 Supabase `travel-api`를 사용합니다.

## 검증

```sh
pnpm check                # lint + typecheck + unit tests + formatting
pnpm build                # 두 앱의 production build
pnpm exec playwright install chromium
pnpm test:e2e             # 두 개발 서버를 자동 시작
pnpm test:watch
pnpm exec vitest run --coverage
pnpm format
```

개발 서버나 브라우저 테스트가 포트를 열었다면 작업을 마칠 때 해당 서버와 자식 프로세스를 종료하고, 사용한 포트가 작업 전 상태로 돌아왔는지 확인합니다. 로컬 Supabase를 이번 작업에서 시작했다면 `pnpm db:stop`도 실행합니다. 다른 작업이 이미 사용 중이던 포트는 보존합니다.

GitHub Actions도 frozen 설치 → check → build → Chromium E2E를 실행합니다. Supabase SQL/Edge/worker 테스트는 별도 환경이 필요하므로 프런트엔드 CI와 분리되어 있습니다.

```sh
pnpm db:start             # Docker 필요
pnpm db:test
pnpm db:types             # 로컬 DB 기준 supabase/database.types.ts 갱신
pnpm db:stop
```

기존 DB 구축/테스트 방법은 [Supabase 문서](supabase/README.ko.md), 실제 action 규격은 [API 문서](supabase/API.ko.md)를 따릅니다. 이 작업에서는 기존 migration/원격 DB를 변경하지 않았습니다.

## 서비스 연결

### Supabase

루트 또는 앱별 `.env.supabase.local`에 `travel-blog` URL과 publishable key를 입력합니다. Vercel Preview/Production의 web/admin도 같은 Supabase 프로젝트를 사용하도록 설정할 예정입니다. 현재 Vercel 환경변수의 전환은 미완료입니다. Supabase Auth에 localhost와 각 배포 도메인의 정확한 `/auth/callback` URL을 등록하고 Site URL을 운영 web 도메인으로 지정해야 합니다. 현재 원격에는 localhost 3000·3002 callback만 등록돼 있어 배포 도메인의 OAuth는 미검증입니다. Kakao provider는 활성화돼 있습니다. 로그인 UI는 카카오 기반이며 네이버는 Custom OAuth 호환성 검증 후 별도로 추가합니다. `me.memberships`와 사이트 ID로 관리자 권한을 검사하고, 실제 쓰기 권한은 기존 서버 API가 다시 검사해야 합니다.

`GET /api/health`는 앱 상태만 반환합니다. `GET /api/site`는 기존 Edge API의 `site.get`을 호출합니다. 미설정은 503, upstream 실패는 502로 구분합니다. 인증·API 요청은 캐시하지 않습니다. 범용 API 요청 함수의 응답은 `unknown`이므로 각 action을 추가할 때 Zod 응답 검증을 붙이세요. 쓰기 요청은 자동 재시도하지 않습니다.

### 자체 오류 모니터링

Sentry SDK 대신 `@repo/observability`가 web/admin의 브라우저 오류 화면·전역 예외와 Next 서버 오류를 작은 오류 봉투로 전송합니다. 메시지·스택은 마스킹하며, 사용자 정보·쿠키·헤더·요청 본문·URL query/slug는 수집하지 않습니다. 문제를 더 자세히 조사할 수 있도록 허용된 상대 파일·줄·열, 고정 작업 코드·의존 서비스·HTTP 상태, 실패한 원래 요청 ID를 수집 요청 ID와 구분해 기록합니다. 브라우저는 같은 출처의 `/api/errors`를 거치고, 서버만 `TRAVEL_ERROR_REPORT_KEY`를 사용해 Supabase `travel-api`로 전달합니다. Supabase Edge에도 같은 키를 secret으로 넣어야 합니다. `NEXT_PUBLIC_ERROR_MONITORING_ENABLED=true`는 오류 테이블 migration과 새 Edge 버전의 권한·마스킹을 로컬/격리 테스트와 단일 원격 canary에서 검증한 뒤 켜세요. `NEXT_PUBLIC_DEPLOY_ENV`(`production`/`preview`/`development`)과 `NEXT_PUBLIC_APP_RELEASE`는 환경/릴리스 구분에 사용합니다. `admin.errors`와 `admin.error.get`은 활성 `admin` 역할만 허용합니다. 관리자 `/error-analytics-preview`의 목록·상세 조회는 API 연결 경로가 있으며 차트와 HTML 수치는 예시다. 기본 빌드는 공개 브라우저 source map을 만들지 않고, `build:private-maps`와 `pnpm error:source-map:lookup`은 동일한 격리 빌드의 비공개 로컬 조사에만 사용합니다. 운영 배포의 자동 원본 코드 위치 복원은 아직 구현되지 않았습니다. 세부 rollout·보유·알림 검증은 [통합 QA 기록](docs/RELEASE-QA.ko.md)과 [운영 배포 기록](docs/PRODUCTION-RELEASE.ko.md)을 따릅니다.

### Firebase / GA4

web에만 Firebase web app config와 measurement ID를 입력하고 `NEXT_PUBLIC_ANALYTICS_ENABLED=true`로 설정합니다. 화면에서 동의한 뒤에만 SDK 수집을 시작하며 동의를 끄면 중지합니다. 동의는 현재 화면 세션의 메모리에만 유지합니다. 관리자에는 Analytics를 넣지 않습니다.

수동 route page_view를 사용하므로 **GA4 웹 스트림의 향상된 측정에서 페이지 로드/브라우저 기록 기반 페이지뷰를 끄고** DebugView로 중복 여부를 확인하세요. 운영 배포에서만 활성화하고 개발·preview에는 false를 유지합니다. URL query/hash를 이벤트에서 제외합니다. 현재 동의 컴포넌트는 홈에서만 렌더링되므로 전역 페이지 추적과 동의 저장·철회는 아직 구현해야 합니다. GA4 Data API 운영 통계 화면은 후속 기능입니다.

### 에디터 / UI

BlockNote는 Next dynamic import의 `ssr:false`로만 로드합니다. 기존 서버 renderer가 지원하는 문단·제목·목록·인용·코드 블록으로 제한했습니다. 이미지 블록은 asset ID 업로드/변환 경로를 구현한 뒤 추가해야 하며, 서버에 전달할 때도 기존 API의 검증을 거쳐야 합니다. BlockNote JSON을 원본으로 유지하고 미리보기에는 읽기 전용 에디터를 사용합니다.

shadcn 구성은 `packages/ui/components.json`에 있습니다. 두 앱에서 `@repo/ui/button`과 `@repo/ui/styles.css`를 사용합니다. 추가 컴포넌트는 UI 패키지에 생성하고 필요한 primitive 의존성을 같은 패키지에 설치합니다.

## 설정 원칙과 구현 범위

- 직접 의존성은 정확한 버전과 lockfile로 관리합니다. TypeScript 6.0.3은 typescript-eslint의 지원 범위에 맞췄습니다.
- `.env.local`·Supabase 로컬 상태·테스트 산출물은 Git에서 제외합니다. `.env.example`만 공유합니다.
- Turbo는 NEXT_PUBLIC 변수를 build hash에 포함합니다. 배포 공개 변수 변경 후 재빌드하세요.
- formatter는 기존 별도 작업인 supabase/docs/DESIGN을 자동 변경하지 않습니다.
- 프런트엔드 기반 설정 완료와 실제 서비스 운영 검증은 별개입니다. OAuth 실로그인, RLS 통합, 자체 오류 수집, Firebase DebugView는 실제 프로젝트 자격 정보가 필요합니다.

공식 참고: [Supabase SSR](https://supabase.com/docs/guides/auth/server-side/creating-a-client), [BlockNote shadcn](https://www.blocknotejs.org/docs/getting-started/shadcn), [Next.js instrumentation](https://nextjs.org/docs/app/api-reference/file-conventions/instrumentation), [Firebase Analytics](https://firebase.google.com/docs/analytics/web/get-started).

## Penpot 설계 기반 MirageJS 개발 환경

```sh
pnpm dev:mock
```

[공개 앱 API 체험](http://localhost:3000/mock)과 [관리자 API 체험](http://localhost:3002/mock)에서 계정·DB 없이 예시 데이터를 사용할 수 있습니다. 다섯 카테고리, 글·댓글·좋아요, 버전 충돌, 홈 템플릿과 권한·오류 상태를 `@repo/mock-api`가 처리합니다.

[Mock 패키지 설명](packages/mock-api/README.md)에 fixture 출처, 실제 API 전환, SSR 제한과 지원 action을 정리했습니다. `pnpm test:e2e:mock`으로 검증합니다. 데이터는 브라우저 탭 메모리에만 있으며 새로고침 시 초기화됩니다. 운영 빌드에서는 활성화되지 않습니다.
