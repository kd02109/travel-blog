# 첫 공개 운영 배포 기록과 중단 기준

기준일: 2026-10-08. 이 문서는 첫 공개 승인 항목의 실행 기록 양식이다. **현재 공개 승인과 운영 배포는 보류 상태다.** 코드·mock·SQL rollback 검사만으로 아래 항목을 통과 처리하지 않는다. 실제 검증 결과, 담당자, 시간, 배포 식별자를 같은 릴리스 기록에 남긴 뒤 승인한다. [현재 QA 결과](./RELEASE-QA.ko.md)와 [미디어 전환 절차](./media-worker-vercel-supabase.ko.md)를 함께 사용한다.

## 배포 전 필수 확인

| 공개 승인 항목                                                             | 현재 상태                                              | 통과 증거로 남길 것                                                                                            |
| -------------------------------------------------------------------------- | ------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------- |
| 실제 owner의 다중 사진 초안·재접속·수정·발행                               | 보류: staging owner 실제 Kakao 가입 전                 | staging/운영 후보의 앱 Auth 이메일 인증과 활성 owner membership, 작성 흐름의 글/asset ID와 브라우저 결과       |
| 비회원 글·이미지와 만료 signed URL 갱신                                    | 보류: 실제 파일 종단 시험 전                           | 익명 상세 접근·사진 표시, 만료 후 재요청 결과와 Storage 경로의 권한 검사                                       |
| PDF 업로드·변환·열람과 PDF 댓글/좋아요 제한                                | 보류: Vercel Linux native 시험 전                      | 실제 PDF 자산의 queue→ready, 표지·뷰어·미허용 상호작용 결과                                                    |
| 회원·비회원 댓글, 숨김, 일반 글 좋아요                                     | 보류: staging 전체 흐름 전                             | 두 역할의 작성/수정·관리자 숨김·권한 회수 후 재요청 결과                                                       |
| 비공개/삭제 글과 파일 접근                                                 | 보류: 실제 삭제·signed URL 시험 전                     | 공개 404/403, 참조 중 삭제 방지, Storage API 실패·lease 재시도, URL 만료 정책                                  |
| 관리자 권한·`admin.errors` 격리                                            | 부분: 임시 staging JWT 검사는 통과                     | 실제 OAuth owner/admin/editor/독자 및 역할 회수 뒤 API 재요청·화면 결과                                        |
| 오류 관측·GA 동의/철회·큐 복구·DB/Storage 복원                             | 보류: 오류 알림/보존 job·GA 상태 지속·복원 훈련 미완료 | 민감정보 마스킹과 조회 권한, 알림 수신, 동의 재방문/철회, 백업 시점·복원 시간·담당자, 큐 중단/재개 기록        |
| sitemap/robots/Search Console, Preview/admin 보호, Kakao callback/로그아웃 | 부분: Preview 두 프로젝트·noindex 확인, 실제 OAuth 전   | HTTPS 두 앱 URL, Kakao→Supabase 및 Supabase→앱 callback, 로그아웃, 비공개 noindex/권한, 공개 sitemap/색인 결과 |
| 부모님 사용성 검수와 롤백 리허설                                           | 보류                                                   | 실제 작성·발행·사진·답글 수행 결과, 이전 배포로 되돌리는 데 걸린 시간과 담당자                                 |

다음 기반 조건도 모두 확인한다.

1. 기능별 PR을 순서대로 검토·병합하고, `main`의 필수 CI/빌드와 배포할 SHA를 고정한다. staging의 32개 migration 버전 불일치를 [공식 repair 절차](https://supabase.com/docs/reference/cli/supabase-migration-repair)로 정합화하기 전에는 `db push`를 실행하지 않는다. 기존 `travel-blog` DB를 reset하거나 SQL 파일을 무조건 재적용하지 않는다.
2. Vercel의 web/admin **서로 다른 두 프로젝트**는 Git 저장소와 각각 `apps/web`, `apps/admin` 루트로 연결됐고 두 Linux Preview 빌드는 Ready다(web `DymzWo5qc`, admin `64bzJijPA`). 고정 QA 주소에는 팀 로그인 보호와 noindex가 있다. 실제 Function/파일 처리, Kakao와 API 연결은 미검증이다. 현재 staging Edge가 두 Preview Origin을 403으로 거절하므로 정확한 HTTPS Origin과 Auth Redirect URLs를 등록하고 재검증한다.
3. 운영 web/admin HTTPS 도메인, TLS, DNS, canonical, `NEXT_PUBLIC_SITE_URL`, Supabase Kakao provider의 callback, 두 앱 callback allowlist, **정확한 운영 Origin**의 Edge CORS를 대조한다. `NEXT_PUBLIC_*`와 빌드 산출물에 service key/오류 수집 key/Cron secret이 없어야 한다. Production에 mock/광고/분석 플래그를 의도치 않게 켜지 않는다. `NEXT_PUBLIC_SITE_URL`이 누락되면 코드가 localhost 주소로 대체하므로 실제 배포의 canonical/sitemap까지 확인한다.
4. production DB의 migration 기록·실제 schema를 원본 SQL과 대조하고, 백업·Storage 복원 가능 시점과 담당자를 확인한다. production Edge v19에는 현재 오류 API와 좁힌 CORS가 아직 없으므로, 호환되는 최신 Edge 소스 배포 및 권한 재검사가 필요하다.
5. 매분 미디어 Cron을 쓸 계정은 해당 주기를 지원하는 Vercel 요금제와 비용 상한을 승인받는다. `TRAVEL_MEDIA_CRON_ENABLED`는 **빌드 시점의 명시적 opt-in**이며 기본값은 꺼짐이다. `TRAVEL_MEDIA_WORKER_ENABLED`는 route 실행 flag다. 전자는 배포를 다시 해야 스케줄이 바뀌고, 후자는 스케줄을 제거하지 않는다. Docker polling과 Vercel Cron이 같은 큐에서 동시에 claim하지 않도록 실행기 전환 시점을 기록한다.

## 증거 기록 양식

비밀값·개인정보·OAuth code·원본 파일명을 기록하지 않는다. 링크는 권한 있는 운영자만 열 수 있게 하고, 외부 공개 PR에는 비밀 데이터를 넣지 않는다.

```text
릴리스 이름/담당자/승인자:
공개 승인 시간(시간대 포함): 보류
Git main SHA / 검증된 staging SHA:
production DB project ref / 적용 migration 파일·원격 버전:
production Edge travel-api 이전→신규 버전 / 검증 요청 ID:
Vercel web project ID·deployment ID·도메인:
Vercel admin project ID·deployment ID·도메인:
이전 정상 web/admin deployment ID / 되돌리기 담당자:
Cron plan·등록 여부 / Docker 중지 시각 / worker flag 변경 시각:
각 공개 승인 항목의 증거 링크·통과 시각·확인자:
DB 백업 시점 / Storage 복원 시험 결과 / 복구 목표·실측 시간:
오류·API 5xx/429·queue 지연/실패·Storage 전송·Function 비용의 기준값, 경보 수신자:
운영 smoke 결과 / 공개 중단 조건 / 롤백 결정 시간:
```

## 승인 뒤 적용 순서

1. 변경 동결 시점의 SHA와 모든 게이트 증거를 다시 확인한다. 하나라도 비었거나 재현되지 않으면 멈춘다. production 프로젝트와 staging 프로젝트의 ref·도메인·환경변수 범위를 서로 확인한다.
2. 호환되는 **확장형 DB migration → `travel-api` Edge → 보호된 admin Function → web/admin** 순으로 배포한다. 기존 production DB에는 이미 33개 migration이 적용된 기록이 있으므로 실제 원격 이력과 차이를 먼저 계산한다. 변경 전 백업 시점과 이전 Edge·Vercel 식별자를 적는다.
3. admin 첫 production 배포에는 `TRAVEL_MEDIA_CRON_ENABLED=false`를 유지한다. 격리된 canary에서 보호된 Function의 401/503/200과 실제 파일 처리를 확인한 후 Docker polling 중단을 확인한다. 지원 요금제와 1분 주기 비용이 승인되면 Cron opt-in을 설정하고 **새 admin deployment**를 만들어 실제 delivery·중복 방지·적체를 확인한다. 하나의 job을 한 번만 처리한다고 Cron 전송 자체에 의존하지 않는다.
4. 운영 두 도메인에서 owner/익명 smoke, 이미지/PDF, 권한 차단, 카카오 로그아웃, 오류 수집, GA 동의/철회, sitemap/robots/noindex를 재검사한다. 대표 글·소개·정책·문의와 부모님 검수 결과를 확인하고 공개 전환한다.
5. 공개 직후 오류율, 5xx/429, media queue의 가장 오래된 작업·실패·만료 lease, Storage 전송량, Vercel Function 시간/비용을 담당자가 집중 관찰한다. 경보 미수신·비용 상한 초과·핵심 작성/열람 장애가 발생하면 공개를 중단하고 아래 절차를 따른다.

## 중단과 복구

- 새 글·로그인·파일 접근이 실패하거나 개인정보/비밀값 노출이 의심되면 공개 전환을 멈추고 시각·영향 범위·요청 ID를 기록한다. 노출된 key는 해당 서비스에서 회전한다.
- 웹/관리자 UI 장애는 기록한 이전 **호환 가능한** Vercel deployment로 되돌리고 즉시 smoke를 반복한다. Edge 오류라면 이전 호환 API 버전으로 되돌리거나 앞으로 수정한 버전을 배포한다. DB schema가 바뀐 뒤 이전 UI가 호환되는지 먼저 확인한다.
- 미디어 장애는 `TRAVEL_MEDIA_CRON_ENABLED=false`인 admin deployment로 스케줄을 제거하고 `TRAVEL_MEDIA_WORKER_ENABLED=false`가 반영됐는지 확인한다. 진행 중인 lease가 끝나고 새 claim이 멈춘 뒤 필요하면 Docker polling **한 실행기만** 시작한다. 이미 처리한 Storage 객체·DB 상태를 확인한다.
- production DB reset, `storage.objects` 직접 SQL 삭제, 무검증 down migration은 하지 않는다. 데이터 손상 때는 검증한 복원 지점과 Storage 복구 절차를 따라 별도 격리 환경에서 먼저 확인하고 서비스 재개 여부를 승인받는다.

이 문서는 운영 배포 명령의 실행 승인이 아니다. 실제 공개와 production 변경은 각 게이트의 증거와 담당자의 승인 후에만 진행한다.
