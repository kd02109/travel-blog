# 공개 블로그

실행: 저장소 루트에서 `pnpm --filter web dev` (3000).
실제 Supabase 연결: 이 디렉터리에서 `pnpm dev:supabase` 또는 루트에서 `pnpm --filter web dev:supabase`.
개발 서버는 소스 변경을 바로 반영합니다. `pnpm start`는 기존 운영 빌드만 실행하므로 최신 소스를 확인하려면 개발 명령을 사용하세요.
실행 모드: 루트에서 `pnpm dev:mock` 또는 `pnpm dev:supabase`.
실제 연결 값은 루트/앱별 `.env.supabase.local`을 사용합니다.
공통 구성 및 서비스 연결은 [루트 README](../../README.md)를 참고하세요.
