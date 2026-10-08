# 첫 공개 통합 QA 기록

기준일: 2026-10-08. 이 문서는 자동 검사와 실제 배포 검사를 구분한다. 실패하거나 실행하지 않은 항목은 공개 승인으로 계산하지 않는다.

| 범위                | 확인 결과                                                                                                                                                           | 한계                                                                                                                  |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| 격리 Supabase       | 신규 `travel-blog-staging`에 migration 33개와 `travel-api` v3 적용. rollback SQL 7개, 공개/무인증/방문자/CORS HTTP 4개, 임시 admin·editor JWT와 권한 회수 검사 통과 | 원격 migration 버전 32개가 로컬 파일명과 달라 `db push` 금지. 실제 Kakao owner 가입과 파일 처리는 미검증              |
| 브라우저 기본 경로  | `pnpm test:e2e`: 7개 통과. 익명 관리자 차단, OAuth 취소·오류 안내, 로그아웃 Origin 검사                                                                             | Supabase 자격증명을 비운 시험이라 실제 Kakao 인증 증거가 아니다. 홈 접속 중 구성 누락 오류 로그가 있어 후속 정리 필요 |
| Mirage 계약·오류    | `pnpm test:e2e:mock`: 11개 통과. 목록/댓글·409·429·지연·네트워크 실패 포함                                                                                          | 실제 Storage·Auth·Edge의 대체가 아니다                                                                                |
| 서버 렌더링         | `pnpm test:ssr`: 4개 통과. JavaScript 없이 목록·페이지 이동·본문·빈 목록·404·OG 이미지 검사                                                                         | 격리 HTTP backend 사용. `/posts`의 `loading.tsx`가 응답을 가리던 문제를 제거한 뒤 통과                                |
| Vercel Preview      | staging 공개 변수로 web/admin Linux Preview 빌드 Ready. 고정 QA URL의 팀 로그인 보호와 noindex, 로컬 빌드의 robots/sitemap·미인증 Function 401 확인                   | Preview Origin의 staging API preflight는 현재 403. Kakao·실제 파일/오류 Function 종단 검사는 미실행                  |

`test:ssr`을 CI에 추가했다. 이 테스트는 브라우저 Mirage를 서버 요청에 적용하지 않고 `tests/ssr/backend.mjs`의 격리 HTTP backend를 사용한다. `test:e2e`, `test:e2e:mock`, `test:ssr`가 연 개발 서버는 Playwright 종료 후 사용 포트에 리스너가 없음을 확인했다.

## 외부 환경에서 남은 출시 차단 항목

1. web/admin 두 Git 프로젝트와 Preview 빌드는 준비됐다. 고정 web/admin Preview HTTPS Origin을 staging `TRAVEL_API_ALLOWED_ORIGINS`에 추가해 각 preflight 204·POST 성공, 임의 Origin 403을 확인한다. 필요한 관리자 Function secret은 staging 전용으로 두고 재배포 후 브라우저 bundle의 비밀값 부재를 확인한다.
2. Staging Kakao provider와 두 고정 Preview callback을 설정한다. 지정 owner의 실제 앱 Auth 가입·이메일 확인·활성 membership, 익명/일반/관리자/권한 회수, 취소·만료·로그아웃을 브라우저와 서버 요청으로 확인한다.
3. 실제 사진·고화질 사진·PDF로 signed upload→queue→Vercel Node Function→ready→공개 열람, 실패/backoff/중복 호출, 참조 중 삭제 차단, Storage API 삭제 실패·lease 재시도를 수행한다. 같은 큐에 Docker와 Cron을 동시에 켜지 않는다.
4. Preview 보호·noindex, CORS/Origin 허용 범위, CSP, GA 동의/철회, 오류 수집 권한·마스킹·알림, sitemap/robots/Search Console을 실제 배포 도메인에서 확인한다. Staging Edge v3는 localhost만 허용하고 미허용 Origin을 403으로 거절한다. 실제 Preview 고정 출처는 아직 미등록이다. 기존 운영 후보 Edge v19는 와일드카드 CORS를 반환하므로 운영 도메인 확정 후 별도 배포·검증이 필요하다.
5. DB·Storage 복원 리허설, 부모님의 글 작성·발행·사진 추가, 모바일 성능·접근성, 담당자·알림·비용 상한, 공개 중단·롤백 기준을 기록한다. [운영 배포 기록의 승인 항목](./PRODUCTION-RELEASE.ko.md#배포-전-필수-확인)을 모두 통과하기 전 운영 배포를 시작하지 않는다.

## 릴리스 식별자

| 환경               | DB migration                     | `travel-api`       | web/admin 배포 | 미디어 실행기                             |
| ------------------ | -------------------------------- | ------------------ | -------------- | ----------------------------------------- |
| 신규 staging       | 33개 적용, 32개 버전 정합화 필요 | v3                 | web `DymzWo5qc`, admin `64bzJijPA` Preview Ready | Docker/Vercel 모두 staging 실파일 검증 전 |
| 기존 `travel-blog` | 마지막 확인 시 33개 적용         | 마지막 확인 시 v19 | web/admin Production 미배포                         | 기존 Docker fallback, 새 Cron 미배포      |

실제 배포를 시작하면 각 SHA, migration 파일/원격 버전, Edge 버전, Vercel deployment ID, smoke 결과와 롤백 시점을 이 표와 PR에 함께 기록한다. 기존 `travel-blog` DB는 reset하지 않는다.
