# 관리자

실행: 저장소 루트에서 `pnpm --filter admin dev` (3002).
실제 Supabase 연결: 이 디렉터리에서 `pnpm dev:supabase` 또는 루트에서 `pnpm --filter admin dev:supabase`.
연결 값은 루트/앱별 `.env.supabase.local`에서 읽습니다.
개발 서버는 소스 변경을 바로 반영합니다. `pnpm start`는 기존 운영 빌드만 실행하므로 최신 소스를 확인하려면 개발 명령을 사용하세요.
`/write`는 서버에서 사용자와 사이트 편집 권한을 확인합니다.
`/playground`는 개발 환경 전용이며 작성 내용은 저장하지 않습니다.
환경 변수와 연동 범위는 [루트 README](../../README.md)를 참고하세요.
