import { describe, expect, it } from "vitest";
import { describeApiError, TravelApiError } from "./errors";

describe("describeApiError", () => {
  it("uses read guidance without claiming a draft was retained", () => {
    const guidance = describeApiError(new Error("offline"), "read");
    expect(guidance).toMatchObject({
      title: "내용을 불러오지 못했어요",
      canRetry: true,
    });
    expect(guidance.description).not.toContain("입력");
  });

  it("treats an uncertain write result as a manual decision", () => {
    const guidance = describeApiError(
      new TravelApiError(0, "network_error"),
      "write",
    );
    expect(guidance.canRetry).toBe(true);
    expect(guidance.description).toContain("현재 상태를 확인");
    expect(guidance.description).not.toContain("반영되지 않았");
  });

  it.each([
    [401, "session_expired", "로그인이 만료됐어요"],
    [403, "forbidden", "접근 권한이 없어요"],
    [404, "not_found", "대상을 찾을 수 없어요"],
    [409, "version_conflict", "다른 변경과 충돌했어요"],
  ])("gives %i guidance without an unsafe retry", (status, code, title) => {
    expect(
      describeApiError(new TravelApiError(status, code), "write"),
    ).toMatchObject({
      title,
      canRetry: false,
    });
  });

  it("distinguishes visitor expiry from an admin session", () => {
    expect(
      describeApiError(new TravelApiError(401, "invalid_visitor"), "write"),
    ).toMatchObject({
      title: "방문자 인증이 만료됐어요",
      canRetry: false,
    });
  });

  it("preserves the rate-limit deadline for the retry button", () => {
    const error = new TravelApiError(429, "rate_limited", undefined, 30);
    expect(describeApiError(error, "read")).toMatchObject({
      title: "요청이 잠시 제한됐어요",
      canRetry: true,
      retryAt: error.retryAt,
    });
    expect(
      describeApiError(new TravelApiError(429, "rate_limited"), "read")
        .canRetry,
    ).toBe(false);
  });

  it("explains unsupported mock uploads instead of asking for retry", () => {
    expect(
      describeApiError(
        new TravelApiError(501, "mock_upload_not_implemented"),
        "write",
      ),
    ).toMatchObject({
      title: "파일을 저장할 수 없어요",
      canRetry: false,
    });
  });

  it("prompts for a corrected comment password", () => {
    expect(
      describeApiError(new TravelApiError(403, "invalid_password"), "write"),
    ).toMatchObject({
      title: "비밀번호가 일치하지 않아요",
      description: "비밀번호를 다시 입력해 주세요.",
      canRetry: false,
    });
  });

  it("explains that an unknown setting needs a database migration", () => {
    expect(
      describeApiError(new TravelApiError(422, "unknown_setting"), "write"),
    ).toMatchObject({
      title: "설정을 적용할 수 없어요",
      description:
        "서버가 이 설정 항목을 인식하지 못합니다. 최신 데이터베이스 마이그레이션을 적용해야 합니다.",
      canRetry: false,
    });
  });

  it("keeps other validation failures in guidance-only mode", () => {
    expect(
      describeApiError(new TravelApiError(422, "invalid_input"), "write"),
    ).toMatchObject({
      title: "요청을 처리할 수 없어요",
      description: "입력 내용과 현재 상태를 확인해 주세요.",
      canRetry: false,
    });
  });
});
