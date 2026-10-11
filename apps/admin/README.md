# 관리자

실행: 저장소 루트에서 `pnpm --filter admin dev` (3002).
실제 Supabase 연결: 이 디렉터리에서 `pnpm dev:supabase` 또는 루트에서 `pnpm --filter admin dev:supabase`.
연결 값은 루트/앱별 `.env.supabase.local`에서 읽습니다.
개발 서버는 소스 변경을 바로 반영합니다. `pnpm start`는 기존 운영 빌드만 실행하므로 최신 소스를 확인하려면 개발 명령을 사용하세요.
`/write`는 서버에서 사용자와 사이트 편집 권한을 확인합니다.
환경 변수와 연동 범위는 [루트 README](../../README.md)를 참고하세요.
글 관리의 “공개 글 보기” 링크는 관리자 서버의 `WEB_ORIGIN`을 공개 웹 사이트의 origin(예: `https://blog.example.com`)으로 설정하면 표시됩니다. 개발 모드에서는 값이 없을 때 `http://localhost:3000`을 사용하고, 운영 모드에서는 HTTPS origin이 없으면 링크를 표시하지 않습니다.

## 오류 이메일 알림 (Resend)

`GET /api/internal/error-alerts`는 서버 전용 `CRON_SECRET` Bearer 인증을 통과한 경우에만 실행됩니다. 요청 body/query로 수신자나 메일 내용을 받지 않습니다. web/admin 오류 중 지정한 환경·사이트의 `open` issue가 최근 5분에 10회 이상 발생한 경우 한 건을 처리합니다.

다음 값을 `apps/admin/.env.local` 또는 `.env.supabase.local`에 설정합니다. `dev:supabase`에서 동일한 이름이 겹치면 `.env.supabase.local`이 우선합니다. Vercel에는 **admin 프로젝트의 서버 환경변수**로 등록하고 재배포해야 합니다. web 프로젝트에는 Resend 키가 필요하지 않습니다.

```dotenv
RESEND_API_KEY= # Resend Sending access key; never NEXT_PUBLIC_
ERROR_EMAIL_FROM=onboarding@resend.dev
ERROR_EMAIL_TO= # Resend 가입 이메일 (시험용)
ERROR_EMAIL_ENVIRONMENT=preview
ERROR_EMAIL_SITE_SLUG=parents-travel
TRAVEL_ERROR_EMAIL_ENABLED=false
SUPABASE_URL= # 오류가 저장되는 프로젝트
SUPABASE_SERVICE_ROLE_KEY= # 또는 SUPABASE_SECRET_KEY
CRON_SECRET= # 최소 32자, 기존 서버 전용 스케줄러 인증 키
```

- 먼저 `error_email_alerts` migration을 적용합니다. `app_private.web_error_email_outbox`와 service-role 전용 `travel_error_email` RPC가 생성됩니다. 브라우저 테이블/RPC 접근은 허용하지 않습니다.
- `TRAVEL_ERROR_EMAIL_ENABLED=true`로 명시해야 발송합니다. mock 실행에서는 키와 활성화 상태를 차단합니다.
- onboarding 발신자는 Resend 가입 주소로만 시험할 수 있습니다. Production에서는 인증한 도메인의 실제 발신 이메일을 입력해야 합니다. 코드도 Production의 `@resend.dev` 발신을 거절합니다.
- `ERROR_EMAIL_ENVIRONMENT`는 Vercel 환경과 같아야 합니다. 로컬에서 실제 Preview 오류를 검사할 때는 `preview`, 폐기 가능한 로컬 DB 오류는 `development`를 사용합니다.
- 같은 issue는 30분 동안 새 알림을 만들지 않고, 전체 환경을 합쳐 24시간에 50건만 예약합니다. 실패도 한도를 차지합니다. 기존 Resend 계정의 다른 발송은 이 한도에 포함되지 않습니다.
- DB lease 2분, 최대 3회 시도, 실패 후 최소 5분 대기이며 `Retry-After`가 더 길면 해당 대기 시간을 반영합니다. Resend idempotency key와 고정된 수신자·본문으로 재시도합니다. 23시간이 지난 대기는 중단하여 공급자의 24시간 중복 방지 기간을 넘겨 재발송하지 않습니다.
- 200 `accepted`는 Resend 접수 성공이며, 받은편지함 도착 보장은 아닙니다. `idle`은 조건에 맞는 알림이 없음, 401은 실행 인증 실패, 503은 설정/발송/DB 실패입니다. 상세 상태는 outbox의 `status`, `attempts`, `provider_id`, `last_error_code`로 확인합니다.
- 메일에는 앱·환경·issue ID·발생 횟수만 보냅니다. 메시지/스택/방문자 정보와 공급자 오류 원문을 로그나 메일에 기록하지 않습니다.

### 자동 실행

이 endpoint를 **1분 간격**으로 호출할 스케줄러가 필요합니다. migration 적용이나 키 등록만으로 자동 발송이 시작되지는 않습니다. 별도 Vercel 유료 Cron을 요구하지 않도록 Supabase Cron + pg_net을 사용할 수 있습니다. 아래 작업은 대상 배포 확인 후 명시적으로 구성합니다.

1. Supabase Vault에 `error_alert_dispatch_url`(admin 배포의 `/api/internal/error-alerts`)과 `error_alert_cron_secret`(동일한 CRON_SECRET)을 저장합니다. 실제 값은 Git/채팅에 넣지 않습니다.
2. Supabase `pg_net` 확장을 활성화하고 Cron을 등록합니다. HTTP 요청 제한은 25초이며 Next 함수 제한은 30초입니다.
3. Vercel 보호가 있는 Preview 시험은 별도의 보호 우회 헤더가 필요합니다. 보호를 해제하지 않고, QA가 끝나면 스케줄·우회 토큰을 폐기합니다. 아래 예시는 공개 Production URL용이며 Preview에서 그대로 실행하면 인증 보호에 막힙니다.

```sql
select cron.schedule('travel-error-email-dispatch', '* * * * *', $$
  select net.http_get(
    url := (select decrypted_secret from vault.decrypted_secrets
            where name = 'error_alert_dispatch_url'),
    headers := jsonb_build_object('Authorization', 'Bearer ' ||
      (select decrypted_secret from vault.decrypted_secrets
       where name = 'error_alert_cron_secret')),
    timeout_milliseconds := 25000
  );
$$);
```

Supabase Cron 성공은 HTTP 요청 예약 성공일 수 있으므로 `net._http_response`의 상태와 outbox도 함께 검사합니다. 중단은 `cron.unschedule('travel-error-email-dispatch')`와 admin `TRAVEL_ERROR_EMAIL_ENABLED=false` 후 재배포로 수행합니다. 수집이 비활성화된 상태에서는 신규 오류가 쌓이지 않아 알림도 발생하지 않습니다.
