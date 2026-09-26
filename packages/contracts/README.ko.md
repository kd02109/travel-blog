# travel-api 계약

2026-09-26에 Supabase `travel-blog` (`kqbqoopqomrwozpqgono`)의 배포된 `travel-api` v2, `public.travel_api(text, uuid, jsonb)` 함수, 실제 컬럼/null 허용 여부를 조회해 작성했다.

- `src/actions.ts`: 외부에 허용된 33개 action의 입력·응답 Zod 스키마와 `ApiAction`, `ActionInput<A>`, `ActionOutput<A>`.
- 입력은 알려진 필드만 허용한다. `rendered_html`, `actor_hash`, `password_hash` 등 서버 전용 필드는 클라이언트가 보낼 수 없다.
- 응답은 필수 필드와 타입을 검사하고 알려지지 않은 필드는 제거한다. UUID·페이지 범위·변경 버전·역할·상태를 검증한다.
- 초안 content, 설정, 카테고리 metadata는 JSON 객체다. 초안은 미완성 저장을 허용하며 발행 조건, 파일 소유권, 설정의 상세 제약과 권한 검사는 서버가 최종 판단한다.
- SQL 목록은 배열 자체를 반환한다. PDF의 반응 수, 미작성 프로필, 발행 전 시각 등 실제 nullable 필드를 구분한다.
- `asset.create/access/complete`는 내부 DB 행이 아닌 Edge에서 변환한 최종 응답을 정의한다. `rate.consume`, `asset.internal`, `comment.credential` 등 내부 action은 계약에 포함하지 않는다.

## 타입 호출

```ts
import { createTravelApi } from "@repo/api-client";

const api = createTravelApi({
  baseURL: `${supabaseUrl}/functions/v1/travel-api`,
  getAccessToken: async () => currentAccessToken,
});
const site = await api.getSite();
const posts = await api.listPosts({ site_id: site.id });
const me = await api.getMe();
const draft = await api.call("admin.post.get", { id: postId });
await api.savePost({ id: draft.id, version: draft.lock_version, content });
```

`call(action, input)`는 모든 action의 타입을 추론하고 요청 전 입력·응답 수신 후 결과를 검사한다. 스키마 위반은 Zod 오류, 서버의 401/403/409/429 등은 `TravelApiError`로 전달한다. 쓰기 재시도는 수행하지 않는다. 기존 `request`는 Mirage 체험 화면의 이전 호출을 유지하기 위한 deprecated raw transport다. 새 기능은 `call` 또는 `getSite/listPosts/getPost/getMe/createVisitor/listComments/createPost/savePost/publishPost`를 사용한다. Mirage 전체 전환은 로드맵의 별도 계약 정렬 항목에서 처리한다.

## 검증과 한계

```sh
pnpm test
pnpm check-types
pnpm lint
pnpm test:contracts:supabase
```

- 기본 테스트: Edge allowlist와 계약 action 일치, 33개 응답 형태, nullable/PDF/빈 목록, 잘못된 입력·응답, 버전 누락, 내부 필드 주입 차단, 409 전달 검사.
- `test:contracts:supabase`: 각 앱의 실제 Supabase profile을 읽어 공개 사이트/목록, 게시글이 있으면 상세/댓글, 비인증 401, 잘못된 토큰 401, 없는 사이트 404를 검사한다. 사용자/게시글/댓글/업로드/방문자 토큰을 생성하지 않는다.
- 원격 관리 SQL로 읽은 `me`, `admin.posts/members/settings.get/comments/reports/audit` 7개 응답도 Zod 검사를 통과했다. 이는 SQL 응답 형태 검사이며 실제 사용자 토큰의 권한 검증을 대체하지 않는다. 원본 회원·감사 데이터는 저장소에 넣지 않았다.
- 현재 원격 공개 글 목록은 비어 있다. 데이터가 있는 글·댓글·파일과 쓰기 성공 응답은 배포 코드·스키마 및 합성 테스트로 검증했으며, 실제 쓰기 종단 테스트를 완료했다고 간주하지 않는다.
- 원격 `index.ts`는 로컬과 일치한다. `core.ts`의 차이는 로컬의 `as const` 타입 표기뿐으로 런타임 로직은 같다.

이 변경은 로드맵 2번의 첫 항목이다. 서버/브라우저 호출 분리, 토큰 수명·429 대기 정책, Query 키/무효화·입력 보존, Mirage 전체 응답 정렬과 SSR 통합 테스트는 후속 항목으로 남는다.

## 데이터 접근·토큰 정책

서버는 `@repo/api-client/server`의 읽기 전용 클라이언트를 사용한다. 요청마다 현재 토큰을 조회하고 `cache: no-store`로 기존 travel-api에 POST한다. `/posts`와 `/posts/[slug]`가 이 경로를 사용한다. Mirage 모드에서 서버 HTTP 테스트가 필요하면 `TRAVEL_SSR_API_URL`을 격리된 HTTP backend로 명시한다.

브라우저는 `@repo/api-client/browser`의 `mutate`를 사용한다. Supabase SDK는 Auth 용도로만 사용하고 테이블/RPC 호출은 하지 않는다. 세션 만료 60초 전부터 갱신하며 동시 갱신을 합친다. 방문자 토큰은 API가 준 만료 시각을 따르는 메모리 저장이며, 만료 30초 전 재발급한다. 새로고침하면 새로운 방문자 ID가 생길 수 있으므로 좋아요를 고유 인원으로 해석하지 않는다.

401은 재로그인/방문자 재인증, 403은 권한 없음, 409는 입력을 유지한 충돌 안내, 429는 Retry-After 기반 대기와 추가 요청 차단으로 처리한다. 헤더를 읽을 수 없으면 60초 대기를 사용한다. 실패한 쓰기를 자동 재전송하지 않는다. 사용자 승인 후 원격 travel-api v3에 CORS 헤더 한 줄만 추가해 배포했으며 실제 응답의 Retry-After·X-Request-Id 노출을 확인했다.

## Query·Mirage 검증

Query 키에는 사이트·사용자 범위·action·정규화한 입력을 포함한다. 페이지 변경은 offset을 바꾸고 계정 변경 시 캐시를 비운다. 성공한 mutation은 해당 사이트의 공개/관리자 조회를 무효화한다. 프로필·홈 설정 변경은 전체 travel 조회를 무효화한다. 쓰기 재시도는 수동이며 동시에 제출한 요청은 하나로 합친다. 댓글 입력과 idempotency key는 실패 시 보존하고 성공 후 초기화한다.

Mirage는 성공 응답을 동일 Zod 계약으로 검사한다. 누락됐던 profile.avatar_asset_id, membership 시각/granted_by, audit.changes와 파일 URL 형식을 보완했다. `?mockScenario=empty|error|rate-limited|slow|conflict`는 개발 mock 모드에서만 적용한다. slow는 브라우저에서 1.5초 지연을 준다. Next 페이지 이동은 native fetch를 유지해 RSC streaming을 훼손하지 않으며 API만 Mirage가 가로챈다. 업로드/worker는 계속 501로 명시하고 성공한 것처럼 처리하지 않는다.
