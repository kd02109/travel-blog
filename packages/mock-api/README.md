# @repo/mock-api

MirageJS 0.1.48 기반의 **브라우저 개발용** Supabase travel-api 모킹 패키지입니다. 실제 DB·OAuth·Storage를 실행하지 않습니다.

## 바로 실행

```sh
pnpm install --frozen-lockfile
pnpm dev:mock
```

- 공개 앱 체험: http://localhost:3000/mock
- 관리자 앱 체험: http://localhost:3002/mock
- Supabase 계정이나 키가 없어도 실행됩니다.
- 실제 Supabase 연결로 전환하려면 서버를 종료하고 `pnpm dev:supabase`를 실행합니다. `pnpm dev`는 이제 `dev:mock`의 별칭입니다.

실행 스크립트가 모드를 결정하므로 `.env.local`의 플래그를 직접 바꿀 필요가 없습니다. `NODE_ENV=development`에서만 앱에 활성화되며, production에서는 플래그가 enabled여도 provider가 시작되지 않고 `/mock`은 404입니다.

화면에서 guest/reader/editor/admin/owner, 정상/빈 목록/500/429를 선택하고 홈 A 적용·초기화·카테고리 필터·상세·관리자 목록을 확인할 수 있습니다. 새로고침 또는 **데이터 초기화**로 seed 상태로 돌아갑니다. web과 admin, 서로 다른 탭은 메모리를 공유하지 않습니다.

## 데이터 근거

`src/fixtures.ts`의 `FIXTURE_SOURCE`에 Penpot file/page ID, 자료 경로와 기준 날짜를 기록했습니다.

- `docs/design/penpot-five-category-manifest.json`: 공개 목록·상세·댓글·PDF 상태와 다섯 카테고리.
- `docs/design/penpot-five-category-admin-manifest.json`: 관리자 글·상태별 목록.
- `docs/design/penpot-admin-home-templates-manifest.json`: A/B/C/D 선택·저장·적용.
- `docs/design/design-system.tokens.json`: v3 종이색·잉크색. 체험 화면에만 적용.
- `supabase/API.ko.md`, migrations와 Edge Function: action, 필드, 응답 배열, 오류 및 버전 규칙.

**로컬 Penpot 내보내기 자료에서 추론한 fixture입니다. 라이브 Penpot에서 최신 데이터를 가져온 것이 아닙니다.** 제목·본문·댓글·사용자·날짜·수치는 모두 합성 예시입니다. 외부 사진 대신 `public/mock-assets/placeholder.svg`, 실제 여행 일정 대신 한 페이지 `itinerary.pdf`를 사용합니다. 저장소에서 무시된 docs가 없어도 설치·실행·CI는 작동합니다.

기본 seed: 공개 글 5개(카테고리별 1개), 작성 중/비공개/휴지통 예시 각 1개, 댓글 1개, 이미지 5개·PDF 1개, 테스트 사용자 4명, 기본 홈 D. ID와 기준 시각이 고정되어 테스트가 재현됩니다.

## 패키지 경계

| export                      | 역할                                                      |
| --------------------------- | --------------------------------------------------------- |
| `@repo/mock-api/server`     | 브라우저 전용 `startMockServer`, Mirage HTTP adapter      |
| `@repo/mock-api/react`      | 준비 완료 후 children을 렌더링하는 provider, `useMockApi` |
| `@repo/mock-api/engine`     | DOM 없이 실행 가능한 상태 머신, 단위 테스트용             |
| `@repo/mock-api/fixtures`   | 재현 가능한 seed, 테스트 토큰/ID/출처                     |
| `@repo/mock-api/types`      | 상태 및 mock 설정 타입                                    |
| `@repo/mock-api/playground` | 두 앱이 공유하는 개발 체험 화면                           |

Mirage는 `fetch`와 XHR/Axios를 가로챕니다. **Next Server Component, Route Handler, proxy, Server Action 안에서 실행한 서버 요청은 가로채지 않습니다.** `/write`의 실제 인증을 우회하지 않으며 mock 관리 기능은 `/mock`에서 사용합니다. mock mode에서는 proxy의 외부 세션 refresh만 생략합니다.

`MockApiProvider`는 브라우저에서 동적으로 Mirage를 로드하고 준비 전 API consumer를 마운트하지 않습니다. effect cleanup에 `shutdown()`을 호출해 React StrictMode에서 서버가 중복 생성되지 않도록 합니다. 자체 소비자에서는 `useMockApi()`가 null인 동안 mock 요청을 보내지 마세요.

## 요청 주소와 실제 API 전환

1. 기본 mock URL: `/__mock__/functions/v1/travel-api`
2. 패키지에 `supabaseUrl`을 직접 제공하면 그 origin의 `/functions/v1/travel-api`도 같은 engine으로 처리합니다. `dev:mock`은 실제 연결 URL과 키를 지우며, 브라우저 테스트만 가짜 Supabase origin을 사용합니다.
3. 브라우저 `GET /api/site`도 모킹합니다. 주소를 직접 열거나 서버에서 호출하는 경우에는 실제 Route Handler가 동작합니다.
4. Next 페이지·정적 파일·`/api/health`만 네트워크 통과시킵니다. 등록되지 않은 API/외부 요청은 Mirage 오류가 되며 실제 Supabase로 전달하지 않습니다. 이 모드에서는 OAuth와 외부 분석 요청도 사용할 수 없습니다.

새 브라우저 소비자는 공통 factory를 사용하면 mock/실제 API 주소가 자동 전환됩니다.

```tsx
"use client";
import { createBrowserTravelApi } from "@repo/api-client/browser";

// 이 예시는 개발용. 실제 모드의 getAccessToken에는 Supabase 사용자 세션을 전달하세요.
const api = createBrowserTravelApi({
  getAccessToken: async () => "mock-editor",
});
const site = await api.getSite();
const posts = await api.listPosts({ site_id: site.id });
```

`mock-reader`, `mock-editor`, `mock-admin`, `mock-owner`는 **mock 전용 식별자**이며 실제 JWT가 아닙니다. Mock 토큰을 실제 API 모드에 보내지 마세요. Publishable key는 Bearer에 넣지 않습니다. 기본 요청은 guest이며 관리자 역할을 자동으로 부여하지 않습니다.

비회원 반응은 visitor 발급 후 별도 헤더로 전달합니다.

```ts
import { createTravelApi } from "@repo/api-client";
import { MOCK_API_PATH, MOCK_POST_IDS } from "@repo/mock-api/fixtures";

let visitorToken: string | undefined;
const api = createTravelApi({
  baseURL: MOCK_API_PATH,
  getVisitorToken: async () => visitorToken,
});
const visitor = (await api.request("visitor.create")) as {
  visitor_token: string;
};
visitorToken = visitor.visitor_token;
await api.request("like.set", { id: MOCK_POST_IDS[0], liked: true });
```

## 구현한 동작

| 영역      | action 및 동작                                                                                                           |
| --------- | ------------------------------------------------------------------------------------------------------------------------ |
| 공개      | `site.get`, `posts.list`, `post.get`, `comments.list`; 실제처럼 배열 응답, 필터·페이지·비공개 차단                       |
| 사용자    | `visitor.create`, `me`, `profile.save`; 명시적 테스트 Bearer/방문자 토큰                                                 |
| 글        | `admin.posts`, `admin.post.create/get/save/publish/status`, `admin.revisions`, `admin.revision.restore`                  |
| 저장·발행 | 새 글 lock_version=0, 수정마다 증가, stale version 409, 초안과 게시본 분리, 비공개·휴지통 공개 차단                      |
| 댓글      | `comment.create/edit/delete/report`, `admin.comments`, `admin.comment.moderate`, `admin.reports`, `admin.report.resolve` |
| 좋아요    | `like.set`; 같은 사용자 반복 요청 멱등 처리; PDF는 댓글·좋아요 403, 목록 수치는 null                                     |
| 홈 설정   | `admin.settings.get/save/apply`; 저장 후에도 공개 홈 유지, apply에서 반영                                                |
| 권한      | `admin.members`, `admin.member.set`, `admin.audit`; owner/editor/reader 구분, 마지막 owner 보호                          |
| 미디어    | `asset.access`; 공개 연결된 fixture 또는 관리자 접근, 로컬 예시 URL·metadata·PDF preview ID                              |

공개 목록에 본문·초안이 섞이지 않고, 공개 댓글에 비밀번호·내부 actor 정보가 나오지 않습니다. Edge의 순수 `validateAction`, `cleanInput`, `renderBlocks`를 직접 재사용합니다. Deno 코드의 tuple 한 곳에 `as const`를 추가해 기존 동작을 유지하면서 모노레포의 엄격한 TypeScript 검사도 통과시켰습니다.

이는 UI 개발용 주요 계약 구현입니다. 모든 PostgreSQL constraint/RLS, 트랜잭션 격리, JWT·Argon2·서명·HttpOnly 쿠키·만료 처리, 자동 레이트리밋 시간창을 재현한 보안 에뮬레이터가 아닙니다. 실제 비밀번호·개인정보를 입력하지 마세요. 비회원 테스트 비밀번호는 탭 메모리에만 평문으로 비교합니다.

`asset.create`, `asset.complete`는 권한 검사 후 **501 `mock_upload_not_implemented`**를 반환합니다. 실제 바이너리 업로드·이미지/PDF 변환 worker는 이 패키지에서 성공 처리하지 않습니다. 네이버/카카오 OAuth, Supabase REST/RPC/Storage SDK, SSR 데이터, 운영 통계·오류 수집은 모킹 범위 밖입니다.

## 오류·시나리오 제어

```ts
import { startMockServer } from "@repo/mock-api/server";
const mock = startMockServer({ timing: 500 }); // 브라우저의 개발/테스트에서만
mock.engine.failNext("admin.post.save", 409, "version_conflict");
mock.engine.reset("empty");
mock.engine.reset("error"); // 500 mock_unavailable
mock.engine.reset("rate-limited"); // 429 + Retry-After: 60
mock.engine.reset("default");
mock.shutdown();
```

`failNext`는 해당 action 한 번에만 적용됩니다. `reset`은 글·댓글·좋아요·설정·방문자 토큰·주입 오류를 모두 초기화합니다. 이미 root provider가 실행 중이면 `startMockServer`를 다시 부르지 말고 `useMockApi()`로 받은 runtime을 사용하세요.

## 검증

```sh
pnpm test
pnpm check
pnpm test:e2e:mock
```

mock 브라우저 테스트는 포트 **3010/3012**를 사용하고 별도 플래그·가짜 Supabase URL을 설정합니다. 두 앱에서 native fetch·Axios·BFF를 가로채며 실제 Supabase 요청이 발생하지 않는지 확인합니다. 일반 E2E는 `pnpm test:e2e`로 분리했습니다. 개발 서버를 동시에 띄우면 Next의 동일 앱 lock과 충돌할 수 있으므로 종료 후 실행하세요.

참고: [Mirage 공유 서버](https://miragejs.com/quickstarts/react/develop-an-app/), [route handlers](https://miragejs.com/docs/main-concepts/route-handlers/), [passthrough](https://miragejs.com/api/classes/server/).
