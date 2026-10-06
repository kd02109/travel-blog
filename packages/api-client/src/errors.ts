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

export type ApiErrorOperation = "read" | "write";

export type ApiErrorDescription = {
  title: string;
  description: string;
  canRetry: boolean;
  retryAt?: number;
};

/** User-facing guidance shared by the admin and public site. */
export function describeApiError(
  error: unknown,
  operation: ApiErrorOperation,
): ApiErrorDescription {
  const fallback: ApiErrorDescription =
    operation === "read"
      ? {
          title: "내용을 불러오지 못했어요",
          description: "연결 상태를 확인한 뒤 다시 시도해 주세요.",
          canRetry: true,
        }
      : {
          title: "요청을 완료하지 못했어요",
          description:
            "요청 결과를 확인할 수 없습니다. 현재 상태를 확인한 뒤 필요하면 다시 시도해 주세요.",
          canRetry: true,
        };

  if (!(error instanceof TravelApiError)) return fallback;

  if (error.code === "invalid_password")
    return {
      title: "비밀번호가 일치하지 않아요",
      description: "비밀번호를 다시 입력해 주세요.",
      canRetry: false,
    };

  if (error.code === "unknown_setting")
    return {
      title: "설정을 적용할 수 없어요",
      description:
        "서버가 이 설정 항목을 인식하지 못합니다. 최신 데이터베이스 마이그레이션을 적용해야 합니다.",
      canRetry: false,
    };

  if (error.code === "mock_upload_not_implemented")
    return {
      title: "파일을 저장할 수 없어요",
      description:
        "Mock 환경은 파일 저장을 지원하지 않습니다. Supabase 실행 모드에서 다시 시도해 주세요.",
      canRetry: false,
    };

  if (error.status === 401)
    return error.code.includes("visitor")
      ? {
          title: "방문자 인증이 만료됐어요",
          description: "페이지를 새로고침한 뒤 다시 시도해 주세요.",
          canRetry: false,
        }
      : {
          title: "로그인이 만료됐어요",
          description: "다시 로그인한 뒤 작업을 이어가 주세요.",
          canRetry: false,
        };

  if (error.status === 403)
    return {
      title: "접근 권한이 없어요",
      description: "이 작업을 할 수 있는 계정인지 확인해 주세요.",
      canRetry: false,
    };

  if (error.status === 404)
    return {
      title: "대상을 찾을 수 없어요",
      description: "화면을 새로고침해 최신 상태를 확인해 주세요.",
      canRetry: false,
    };

  if (error.status === 409)
    return {
      title: "다른 변경과 충돌했어요",
      description:
        operation === "write"
          ? "입력 내용을 확인하고 최신 상태를 불러온 뒤 다시 시도해 주세요."
          : "최신 내용을 다시 불러온 뒤 확인해 주세요.",
      canRetry: false,
    };

  if (error.status === 429)
    return {
      title: "요청이 잠시 제한됐어요",
      description: "잠시 기다린 뒤 다시 시도해 주세요.",
      canRetry: error.retryAt !== undefined,
      retryAt: error.retryAt,
    };

  if (error.status === 0)
    return {
      ...fallback,
      description:
        operation === "read"
          ? "서버에 연결할 수 없습니다. 연결 상태를 확인한 뒤 다시 시도해 주세요."
          : "서버에 연결할 수 없습니다. 현재 상태를 확인한 뒤 필요하면 다시 시도해 주세요.",
    };

  if (error.status >= 500)
    return {
      ...fallback,
      description:
        operation === "read"
          ? "서버에 일시적인 문제가 있습니다. 잠시 뒤 다시 시도해 주세요."
          : "서버에 일시적인 문제가 있습니다. 현재 상태를 확인한 뒤 필요하면 다시 시도해 주세요.",
    };

  return {
    title: "요청을 처리할 수 없어요",
    description:
      operation === "read"
        ? "요청한 내용을 확인할 수 없습니다. 페이지를 새로고침한 뒤 다시 확인해 주세요."
        : "입력 내용과 현재 상태를 확인해 주세요.",
    canRetry: false,
  };
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
