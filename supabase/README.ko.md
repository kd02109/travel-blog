# 여행 블로그 Supabase 구축 결과

2026-09-19. **원격 DB와 Edge API 배포 완료.** 앱 화면, 소셜 provider 등록, 파일 작업자의 상시 호스팅은 별도 구성이다.

- 프로젝트: `kqbqoopqomrwozpqgono` / `travel-blog` / 서울 리전
- [Supabase 콘솔](https://supabase.com/dashboard/project/kqbqoopqomrwozpqgono)
- [API 상태 확인](https://kqbqoopqomrwozpqgono.supabase.co/functions/v1/travel-api)
- 사이트 ID: `e6bac53e-3c68-49dd-9784-f3c413603ef2`, slug: `parents-travel`
- 직접 관리 15개 테이블 + 기존 Supabase `auth.users` = 설계상 16개
- [API 사용 명세](./API.ko.md), [DB 타입](./database.types.ts), [배포 식별자](./deployment.json)

## 완료한 것

- 간결한 DB 모델의 테이블·FK·CHECK·인덱스·RLS·사이트 초기 데이터.
- 사이트별 owner/admin/editor, 마지막 owner 보호, 사이트 간 파일 연결 차단.
- 글 자동 저장·버전 충돌 감지·수정 이력·게시·비공개·휴지통·초안 복구.
- 공개 목록/상세, 태그·분류 필터, 댓글/좋아요 수 집계.
- 회원/비회원 댓글, Argon2id 관리 비밀번호, 답글·수정·삭제·신고·운영자 숨김.
- 회원/비회원 좋아요, 방문자 서명 토큰, 요청 제한, 중복 댓글 방지.
- 홈 설정의 초안 저장·미리보기 데이터·적용.
- 파일 등록·서명 업로드 URL·업로드 검증·처리 작업 등록·승인 파일의 서명 다운로드 URL.
- 처리 작업 lease·재시도 RPC와 이미지/PDF 작업자 코드.
- 최초 owner 이메일 인증 후 권한 부여 트리거.

## 최초 owner

초기 migration의 owner@example.invalid는 공개 저장소에 넣은 비활성 예시 주소다. 실제 owner 대상은 후속 20260926114006_environment_owner_bootstrap.sql에서 도입한 app_private.owner_bootstrap_targets에 환경별로 지정한다. 새 DB에는 대상이 자동으로 들어가지 않으며, 운영 환경의 기존 owner membership은 유지된다.

Supabase 관리 콘솔 계정과 앱의 Auth 사용자는 별개다. 환경별 대상 이메일을 설정한 뒤에는 앱 Auth의 이메일 인증과 활성 owner membership을 직접 확인한다. 인증되지 않은 가입이나 사용자 수정 가능 metadata만으로 owner 권한을 부여하지 않는다. 개인 계정의 검증 기록은 로컬에만 보관한다.

## API와 데이터 접근 원칙

클라이언트는 `travel-api` Edge Function을 호출한다. Supabase REST 테이블 직접 접근과 `travel_api`/`travel_worker` RPC 직접 실행은 anon/authenticated에 허용하지 않는다. `database.types.ts`에 RPC가 나타나더라도 프런트엔드에서 직접 호출하면 안 된다.

Edge Function은 회원 작업마다 Supabase Auth `getUser(access_token)`으로 검증하고, DB도 해당 Auth 사용자가 삭제/차단 상태가 아닌지 확인한다. 사이트 membership은 매 요청 DB에서 확인한다. 서비스 키는 Edge 런타임 기본 비밀값만 사용하며 소스·브라우저에 저장하지 않았다.

`verify_jwt=false`는 비회원 읽기/댓글을 위한 설정이다. 보호 작업에는 함수 내부에서 실제 사용자 검증을 강제한다. 공개 작업은 명시적인 allowlist만 허용하고 내부 credential/worker/rate 함수는 외부 action으로 호출할 수 없다.

Storage 네 버킷은 **모두 private**으로 생성했다. 기존 명세의 `published-media` public 제안보다 엄격한 구현이며, 공개 승인 파일만 API가 5분 signed URL을 발급한다. 비공개 전환 이전에 발급한 URL은 만료까지 살아 있을 수 있다.

## 파일 작업자 — TypeScript 구현, 호스팅은 미연결

`asset.complete`는 실제 업로드 파일의 크기·매직 바이트·checksum을 확인한 뒤 `processing`으로 전환한다. **작업자가 실행되기 전에는 ready가 되지 않으므로 해당 파일을 게시할 수 없다.** 완료 API가 파일 변환까지 끝났다고 표시하지 않는다.

작업자는 모노레포 패키지로 제공한다.

- [TypeScript worker](../packages/media-worker/README.ko.md)
- [worker 코드](../packages/media-worker/src/worker.ts)

Node.js 24 컨테이너 이미지로 빌드해 환경변수를 주입한다. 아래 명령은 실제 비밀값을 포함하지 않는다.

```sh
docker build -f packages/media-worker/Dockerfile -t travel-media-worker .
docker run --restart unless-stopped --memory=512m --cpus=1 \
  -e SUPABASE_URL -e SUPABASE_SERVICE_ROLE_KEY travel-media-worker
```

필수 환경변수: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`. 비밀값은 호스팅의 비밀 저장소에서 주입한다. worker가 상시 polling하며, 컨테이너 호스트가 실행·재시작을 관리해야 한다. 이 작업에서 유료 실행 환경은 생성하지 않았다.

이미지는 Sharp로 40MP 제한·회전 보정·EXIF 제거·최대 1600px JPEG로 변환한다. 초기 버전에는 480/960px 별도 파생물을 만들지 않는다. PDF.js는 암호화/손상/200쪽 초과 PDF를 거절하고 첫 장 PNG를 만든다. 새 처리 파일이 Storage에 존재하는 것을 확인한 뒤 ready로 반영한다.

현재 API는 `no-store`라 cache 무효화 작업은 완료 처리만 한다. Next.js 페이지 캐시를 도입할 때 해당 작업자에 재검증 hook을 연결해야 한다. 안전 정리 migration은 원격에 적용했다. worker가 오래된 미참조 asset을 DB에서 7일 격리하고 Supabase Storage API로 객체를 지운 뒤 최종 참조 검사와 DB 행 제거를 수행한다. 신규 DB 참조 차단 트리거가 활성화됐으며, Storage 삭제는 격리 후 worker가 실행할 때만 시작한다. 아직 worker 상시 실행과 staging 정리 테스트는 설정하지 않았다. rate-limit 만료 행도 별도 정리 대상이다.

## 검증 결과

- 원격 SQL 통합 테스트 3개 파일 통과: API 기본 흐름, 사이트/파일/PDF/댓글 제약, 최초 owner 이메일 인증.
- Deno 보안·렌더러·Argon2 테스트 6개 통과.
- 실제 배포 URL HTTP 테스트 3개 통과: 공개 조회, 비로그인/위조 JWT 거절, 서명 토큰 검증.
- 새 TypeScript worker의 브라우저/격리 Storage 종단 테스트와 실제 컨테이너 실행은 아직 수행하지 않았다. 해당 확인은 컨테이너 호스팅 연결 후 staging에서 진행한다.
- 모든 직접 관리 테이블 RLS 활성화, 원본 테이블의 브라우저 권한 차단 확인.
- 보안 Advisor: 경고 0개. 성능 Advisor: 누락 FK 인덱스 수정 완료; 신규 DB의 미사용 인덱스 안내만 남음.
- 테스트 Auth 사용자·글·댓글·파일 메타데이터는 SQL 트랜잭션 rollback으로 제거했다. HTTP 검사로 생긴 제한 카운터만 남는다.

실제 파일 업로드→TypeScript worker→게시까지 연결한 운영 종단 검증과 worker 컨테이너 상시는 아직 확인하지 않았다. 기존의 Python 변환 테스트는 새 worker 검증 근거로 사용하지 않는다.

## 변경 파일과 재현

2026-09-26 갱신: 별도 로컬 Supabase에서 migration 7개 전체 재생을 완료했다. `rls_auto_enable()`은 존재하는 환경에서만 권한을 회수하도록 보완했다. `initial_owner.sql`은 개인 이메일 대신 격리 사이트·테스트 이메일을 사용하도록 교체했으며, 모든 테스트는 계속 격리 DB에서만 실행한다. 이후 migration은 새 인스턴스에 순서대로 적용한다. 아래 로컬 reset 미검증 설명은 최초 구축 당시 기록이다.

`migrations/` 파일은 Supabase CLI로 생성한 뒤 원격 적용 결과의 버전으로 파일명을 맞췄다. `deployment.json`에 대응 버전을 기록했다. 최초 API 이후 수정은 후속 마이그레이션으로 적용했다.

이 프로젝트의 기존 `public.rls_auto_enable()` 이벤트 트리거 함수에 대한 공개 실행 권한도 회수했다. 확장된 마이그레이션을 다른 빈 환경에 재생할 때는 Supabase 관리 스키마와 이 기본 이벤트 함수의 존재 여부를 확인해야 한다. 로컬 Docker 데몬이 실행 중이지 않아 로컬 전체 스택 reset 검증은 하지 않았으며 원격 프로젝트에서 테스트했다.

```sh
npx deno check --config supabase/functions/travel-api/deno.json supabase/functions/travel-api/index.ts
npx deno test --config supabase/functions/travel-api/deno.json supabase/functions/travel-api/core_test.ts
npx deno test --config supabase/functions/travel-api/deno.json --allow-net=kqbqoopqomrwozpqgono.supabase.co supabase/tests/http_test.ts
```

SQL 테스트는 이 빈 개발 프로젝트용이다. `tests/initial_owner.sql`은 실제 owner 가입 후에는 실행하지 않으며, 모든 SQL 테스트의 BEGIN/ROLLBACK을 유지한다. 최초 테스트 fixture는 생성/삭제 이메일을 발송하지 않는다.

공식 참고: [Edge Auth](https://supabase.com/docs/guides/functions/auth-legacy-jwt), [데이터 접근 보호](https://supabase.com/docs/guides/database/secure-data), [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security).
