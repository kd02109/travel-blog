export function parseRetryAfter(
  value: unknown,
  now = Date.now(),
): number | undefined {
  if (typeof value !== "string" && typeof value !== "number") return undefined;
  const seconds = /^\d+(?:\.\d+)?$/.test(String(value))
    ? Number(value)
    : (Date.parse(String(value)) - now) / 1000;
  return Number.isFinite(seconds) ? Math.max(0, Math.ceil(seconds)) : undefined;
}
export class TravelApiError extends Error {
  readonly retryAt?: number;
  constructor(
    public status: number,
    public code: string,
    public requestId?: string,
    public retryAfter?: number,
  ) {
    super(code);
    this.name = "TravelApiError";
    this.retryAt =
      retryAfter === undefined ? undefined : Date.now() + retryAfter * 1000;
  }
}
export function errorMessage(error: unknown): string {
  if (!(error instanceof TravelApiError))
    return "요청을 처리하지 못했습니다. 입력은 유지됩니다.";
  if (error.status === 401)
    return error.code.includes("visitor")
      ? "방문자 인증이 만료되었습니다. 다시 시도해 주세요."
      : "로그인이 만료되었습니다. 다시 로그인해 주세요.";
  if (error.status === 403) return "이 작업을 수행할 권한이 없습니다.";
  if (error.status === 409)
    return "다른 변경과 충돌했습니다. 입력을 보관한 채 최신 내용을 확인해 주세요.";
  if (error.status === 429)
    return `${error.retryAfter ?? 60}초 후 다시 시도해 주세요.`;
  if (error.code === "mock_upload_not_implemented")
    return "Mock 환경은 파일 저장을 지원하지 않습니다. Supabase 실행 모드에서 다시 시도해 주세요.";
  return "요청을 처리하지 못했습니다. 입력은 유지됩니다.";
}
export function shouldRetryQuery(failureCount: number, error: unknown) {
  return (
    failureCount < 1 &&
    error instanceof TravelApiError &&
    (error.status === 0 || error.status >= 500)
  );
}
