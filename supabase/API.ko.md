# 여행 블로그 API

Endpoint: `https://kqbqoopqomrwozpqgono.supabase.co/functions/v1/travel-api`

- GET: 상태 확인.
- POST: `Content-Type: application/json`, 본문 `{ "action": "...", "input": { ... } }`.
- 회원 작업: `Authorization: Bearer <Supabase Auth access_token>`.
- 비회원 반응: `visitor.create`에서 발급된 토큰을 `X-Visitor-Token`에 전달.
- 공개 조회는 로그인 없이 가능하다. 로그인하지 않았다면 Authorization 헤더를 생략한다. 프로젝트 publishable/anon 키는 사용자 access_token이 아니므로 Bearer로 보내지 않는다.
- 성공: 반환 JSON 자체. 실패: `{ "error": "version_conflict", "request_id": "..." }`.
- 400 잘못된 입력/미지원 action, 401 로그인/방문자 토큰 필요, 403 권한 없음, 404 없음/비공개, 409 충돌, 422 검증 실패, 429 제한, 500 내부 오류.

현재 목록은 `limit` 기본 12/최대 50, `offset` 기본 0이다. 댓글 UI는 최신 50개를 전달한다. 글 카드 목록에는 본문 HTML 전체를 포함하지 않는다.

## 공개 조회와 사용자

| action | input | 반환 |
| --- | --- | --- |
| `site.get` | `slug` 또는 `site_id`; 생략 시 parents-travel | 사이트 ID·이름·공개 홈 설정 |
| `posts.list` | `site_id`, 선택 `category`, `tag`, `limit`, `offset` | 카드 목록·반응 수 |
| `post.get` | `site_id` + `id` 또는 `slug` | 게시본·반응 수 |
| `comments.list` | `id`=글 ID, 선택 `limit`, `offset` | 안전한 공개 댓글 목록. 각 항목의 `can_manage`는 현재 로그인한 회원 작성자만 참이며, `is_guest`는 비회원 댓글 여부를 나타냅니다. |
| `like.get` | `id`=글 ID | 현재 회원/탭 방문자의 선택 상태와 실제 집계. 비회원은 방문자 토큰 필요 |
| `asset.access` | `id`=파일 ID, 선택 `site_id` | URL·유효기간·파일 metadata·PDF preview ID |
| `visitor.create` | `{}` | 서명 방문자 토큰·만료 시각 |
| `me` | `{}`; 로그인 필요 | 본인 프로필·활성 사이트 역할 |
| `profile.save` | `display_name`; 로그인 필요 | saved |

프로필 아바타 필드는 DB에 준비했지만 업로드/아바타 변경 action은 아직 제공하지 않는다. 기본 별명으로 시작할 수 있다.

관리자 media flow는 `asset.create`로 20MB 이하 signed upload URL을 받고 Storage에 직접 업로드한 뒤 `asset.complete`를 한 번 호출한다. 이후 처리 상태는 읽기 전용 `asset.status`로 확인한다. `asset.list`는 현재 사이트의 `ready` 이미지와 사용 위치를 페이지 단위로 반환하며, 카드 썸네일과 원본에 사용할 300초 signed URL도 함께 반환한다. `asset.complete`는 `failed` 파일에 다시 호출하면 처리 큐에 재등록된다. `asset.cancel`은 아직 업로드/처리 중인 원격 작업을 중단하고 asset을 `failed` 상태로 표시한다. 관리자/owner만 사용할 수 있다. `asset.access`와 `asset.list` URL은 300초 유효하며 private bucket에서만 발급된다.

구버전 Edge Function이 `asset.status`를 지원하지 않으면 관리자 화면의 처리 상태 확인이 보류된다. 새 함수를 배포하고 화면을 새로고침하면 읽기 전용 조회를 사용한다.

미디어 worker는 `service_role`로만 사용할 수 있는 `travel_worker` RPC를 통해 claim/complete/fail/cancel 처리한다. `travel_queue_health`는 큐 대기·실패·만료 lease와 가장 오래된 대기 시간을 반환하는 읽기 전용 모니터다. `travel_media_cleanup`은 오래된 미참조 자산을 격리하고 7일 보존 후 Storage API 삭제·DB 최종 참조 검사 및 제거를 수행한다. 원격 migration은 적용했으며, worker가 실행되어야 정리 주기가 시작된다.

```js
const API = "https://kqbqoopqomrwozpqgono.supabase.co/functions/v1/travel-api";
async function api(action, input = {}, token) {
  const response = await fetch(API, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ action, input }),
  });
  const result = await response.json();
  if (!response.ok) throw Object.assign(new Error(result.error), { status: response.status });
  return result;
}
const site = await api("site.get");
const cards = await api("posts.list", { site_id: site.id, limit: 12 });
```

## 글과 수정 이력 — editor/admin/owner

| action | input | 반환 |
| --- | --- | --- |
| `admin.posts` | `site_id`, 선택 `limit`, `offset`, `category`, `status`, `search` | 분류·상태·제목/주소 검색이 적용된 글 목록과 `category_code` |
| `admin.post.create` | `site_id`, `kind: article 또는 pdf`, 선택 `content` | 새 글과 lock_version |
| `admin.post.get` | `id`, 선택 `site_id` | 편집본 |
| `admin.post.published` | `id`, 선택 `site_id` | 현재 공개 중인 revision ID·원문 snapshot·발행 시각. 공개본이 없으면 null |
| `admin.post.save` | `id`, `version`, `content`, 선택 `checkpoint` | 갱신된 편집본. `checkpoint: true`는 중복되지 않은 내용일 때 이력을 남김 |
| `admin.post.publish` | `id`, `version` | 현재 편집본으로 공개본을 갱신하고 게시 revision ID·새 version 반환 |
| `admin.post.status` | `id`, `version`, `status: private 또는 trashed` | 상태와 새 version |
| `admin.revisions` | `id`=글 ID, 선택 `limit`, `offset` | 이력 종류·글 버전·제목·본문 발췌·현재 공개 여부를 포함한 목록 |
| `admin.revision.get` | `id`=글 ID, `revision_id` | 해당 이력의 전체 snapshot과 메타데이터 |
| `admin.revision.restore` | `id`=글 ID, `version`, `revision_id` | 복구된 초안 |
| `admin.revision.delete` | `id`=글 ID, `version`, `revision_id` | `{deleted:true}`. 현재 공개본이 참조하는 이력은 409로 보호 |

공개된 글의 편집본을 저장해도 독자에게는 이전 공개본이 계속 보인다. 변경 내용을 공개하려면 `admin.post.publish`를 호출한다. 복원은 현재 초안이 달라졌을 때 복원 전 내용을 별도 이력으로 남긴다. 이력 삭제는 DB 행을 영구 제거하지만 현재 공개본이 참조하는 revision은 삭제할 수 없다. 조회한 lock_version을 다음 변경의 version으로 전달하며 409일 때 최신 내용을 다시 읽는다.

일반 글 content 예시:

```json
{
  "title": "서울숲을 함께 걸었던 날",
  "slug": "seoul-forest-walk",
  "category_code": "day-walk",
  "tags": ["서울", "가을"],
  "cover_asset_id": "<ready 이미지 UUID>",
  "blocks": [
    { "type": "paragraph", "content": [{ "type": "text", "text": "천천히 길을 걸었습니다.", "styles": {} }] }
  ],
  "metadata": { "region": "서울", "visited_on": "2026-09-19" },
  "comments_enabled": true
}
```

일반 글 `metadata`는 분류별로 다음 필드를 사용한다. 발행 시 지역과 분류별 필수값을 서버가 다시 검증하며, 초안 저장은 미완성 메타데이터를 허용한다.

| 분류 | `metadata` 예시 | 발행 검증 |
| --- | --- | --- |
| `day-walk` | `{ "region": "서울", "visited_on": "2026-09-19" }` | 지역, 유효한 방문일 |
| `overnight-trip` | `{ "region": "제주", "start_date": "2026-09-19", "end_date": "2026-09-21" }` | 지역, 종료일이 시작일보다 늦음 |
| `food-cafe` | `{ "region": "강릉", "visited_on": "2026-09-19", "place_name": "바다 카페", "venue_type": "cafe" }` | 지역·방문일·장소명, `cafe` 또는 `restaurant` |
| `stay-review` | `{ "region": "제주", "check_in": "2026-09-19", "check_out": "2026-09-21", "place_name": "바다 숙소" }` | 지역·숙박명, 체크아웃이 체크인보다 늦음 |
| `itinerary-pdf` | 별도 메타데이터 없음 | PDF와 첫 장 표지 처리가 완료되어야 함 |

날짜는 `YYYY-MM-DD` 달력 날짜다. 잘못된 날짜는 `422 invalid_date`, 방문일 누락은 `422 missing_date`, 잘못된 기간은 `422 invalid_dates`, 장소명 누락은 `422 missing_place`, 지원하지 않는 장소 구분은 `422 invalid_venue`로 반환한다.

PDF content는 title, slug, category_code=itinerary-pdf, pdf_asset_id를 사용한다. 본문·별도 대표 사진·여행 기간은 요구하지 않는다. ready PDF와 첫 장 표지가 있어야 발행된다.

서버 renderer가 지원하는 블록: paragraph, heading, bulletListItem, numberedListItem, quote, codeBlock, divider, image. 일반적인 BlockNote text/link inline을 지원한다. 지원하지 않는 커스텀 블록은 조용히 버리지 않고 422로 거절한다. image는 `props.asset_id`, `props.caption`을 사용하고 외부 URL을 직접 본문에 넣지 않는다. 공개 HTML의 `figure[data-asset-id]`를 프런트엔드에서 asset.access로 해석해 이미지로 표시해야 한다.

## 댓글과 좋아요

| action | input | 권한/반환 |
| --- | --- | --- |
| `comment.create` | `id`=글 ID, `body`, `request_key`=새 UUID, 선택 `parent_id`; 비회원은 `guest_name`, `password` 추가 | 회원 토큰 또는 방문자 토큰. ID/version/duplicate |
| `comment.edit` | `id`=댓글 ID, `version`, `body`; 비회원은 `password` | 본인 회원 또는 해당 비회원 비밀번호 |
| `comment.delete` | `id`=댓글 ID, `version`; 비회원은 `password` | 본인 댓글 내용 삭제 |
| `comment.report` | `id`=댓글 ID, `reason` | 로그인 필요. spam/abuse/personal_information/other |
| `like.set` | `id`=글 ID, `liked: true 또는 false` | 회원/방문자 토큰. 변경 상태와 count |

비회원 password는 8–128자, guest_name은 2–30자, body는 1–1,000자다. 네트워크 재시도에서는 같은 request_key를 사용하고 새 댓글에는 새 키를 사용한다. 같은 키로 다른 본문을 보내면 409다. PDF와 비공개 글에는 반응을 등록할 수 없다.

visitor.create는 HttpOnly/Secure/SameSite=Lax 쿠키도 발급한다. 다른 도메인에서 직접 API를 호출하는 초기 클라이언트는 응답 visitor_token을 메모리/탭 세션에 보관하고 X-Visitor-Token으로 보낸다. 운영 웹에서 HttpOnly 쿠키만 쓰려면 같은 출처의 Next.js 프록시를 연결한다. 쿠키 삭제로 중복 좋아요를 완전히 막는 것은 아니며 고유 인원 수로 해석하지 않는다.

댓글 생성 계정/방문자당 분당 3회·일 30회, 댓글 작업 분당 10회, 좋아요 조회/변경 분당 30회 제한. 비회원 방문자 토큰은 해당 탭의 `sessionStorage`에 만료 시각과 함께 저장해 새로고침 후에도 좋아요 상태를 조회하고 취소할 수 있다. 비회원 비밀번호 시도는 댓글당 15분 5회로 토큰을 바꾸어도 초기화되지 않는다. 배포 전체 요청 제한도 적용한다. Retry-After 헤더에는 해당 제한 창 기준의 대기 시간을 반환한다.

## 관리자

| action | input | 권한 |
| --- | --- | --- |
| `admin.comments` | `site_id`, 선택 `limit`, `offset` | editor 이상. 글 제목·직원 답변 표시 포함 |
| `admin.comment.moderate` | `site_id`, `id`, `version`, `status: visible/hidden/deleted` | editor 이상. deleted는 되돌리지 않음 |
| `admin.reports` | `site_id`, 선택 `limit`, `offset` | editor 이상 |
| `admin.report.resolve` | `site_id`, `id`=신고 ID, `status: resolved/dismissed` | editor 이상 |
| `admin.settings.get` | `site_id` | editor 이상 |
| `admin.settings.save` | `site_id`, `version`, `settings` | editor 이상 |
| `admin.settings.apply` | `site_id`, `version` | editor 이상 |
| `admin.members` | `site_id` | owner |
| `admin.member.set` | `site_id`, `user_id`, `role`, `active` | owner. 대상은 이미 가입한 Auth 사용자 |
| `admin.audit` | `site_id`, 선택 `limit`, `offset` | admin/owner |
| `admin.account.deletions` | `site_id` | owner/admin. 처리 전 요청과 이메일 |
| `admin.account.deletion.anonymize` | `site_id`, `id`=요청 ID | owner/admin. 댓글 작성자 연결 및 비회원 자격 증명을 제거 |
| `admin.account.deletion.complete` | `site_id`, `id`=요청 ID | owner/admin. Auth 사용자가 삭제되어 FK가 분리된 뒤 완료 표시 |

회원은 `account.delete.request`(입력 없음)로 중복 없는 계정 삭제 요청을 제출할 수 있다. 처리 순서는 관리자 화면에서 댓글 익명 처리 → Supabase Auth 사용자 삭제 → 완료 표시다. 댓글 본문은 공개 대화 기록으로 보존하고 작성자 ID·프로필 연결·비회원 댓글 수정 자격증명을 제거한다. 작성자 표시는 익명 독자로 처리한다. 계정 삭제는 즉시 실행되지 않으며 요청 동안 회원은 계정을 계속 사용할 수 있다. 이메일은 요청 데이터에 복사하지 않고 대기 목록을 보여 줄 때 기존 Auth 사용자에서 읽는다. 모든 댓글이 익명 처리되기 전에는 Auth 삭제 단계를 진행하지 않는다.

홈 settings 허용 필드: template_id(A/B/C/D), title(150자), description(500자), hero_asset_id, hero_asset_ids, featured_post_id. `hero_asset_ids`는 순서가 있는 최대 4개의 사진 ID이고 첫 번째 ID를 `hero_asset_id`에도 기록한다. 사진은 같은 사이트의 ready 이미지, 대표 글은 현재 공개 글이어야 한다. 선택/저장만으로 공개 홈이 바뀌지 않는다. 적용 후 `hero_asset_ids`의 모든 사진을 공개 홈에서 열 수 있다.

## 파일

| action | input | 반환/후속 |
| --- | --- | --- |
| `asset.create` | `site_id`, `kind: image/pdf` | id, bucket, upload_url, token, path |
| `asset.complete` | `id`, 선택 `site_id` | 업로드 검증 후 processing |
| `asset.status` | `id`, 선택 `site_id` | 관리자 권한 확인 후 현재 처리 상태 |
| `asset.cancel` | `id`, 선택 `site_id` | 처리 중인 원격 job 취소, asset을 failed로 표시 |
| `asset.list` | `site_id`, 선택 `limit`, `offset` | 현재 사이트의 ready 이미지, 썸네일/원본 signed URL, 사용 위치, 다음 offset |
| `asset.access` | `id`, 선택 `site_id` | 현재 공개 승인 또는 관리자 권한 확인 후 5분 URL |

asset.create/complete는 editor 이상이다. upload_url에는 파일을 **PUT**으로 올리고 해당 MIME의 Content-Type을 지정한다. Supabase SDK를 쓰면 Storage의 uploadToSignedUrl(bucket,path,token,file)를 사용할 수 있다. 파일을 전송한 뒤 asset.complete를 호출한다. 파일당 20MiB 제한, JPEG/PNG/WebP/PDF를 받는다. ready 처리는 신뢰된 TypeScript/Node.js worker만 할 수 있다. 클라이언트가 state=ready 또는 임의 preview를 제출해서 발행할 수 없다.

DB 내부 `travel_worker`와 `travel_api`는 서비스 역할 전용이다. worker의 claim/complete/fail, rate.consume, asset.internal, comment.credential은 클라이언트 action 목록에 없으며, 키·비밀번호 해시는 응답하지 않는다.

## 아직 연결하지 않은 것

- 카카오·네이버 앱 등록과 OAuth provider 설정/검수.
- 파일 작업자의 상시 호스팅/스케줄러와 운영 캐시 재검증 hook.
- 별도 아바타 변경 API, 운영 백업 스케줄.

이 항목들은 이미 완료된 DB/API 배포와 구분한다.
