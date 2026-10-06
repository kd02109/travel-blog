import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { TravelApiError } from "./errors";
import { ApiErrorProvider } from "./error-provider";
import { ApiErrorState, ApiMutationError } from "./feedback";

it("uses the shared provider policy in the query error template", () => {
  const markup = renderToStaticMarkup(
    createElement(ApiErrorProvider, {
      describe: () => ({
        title: "공통 오류 제목",
        description: "공통 오류 안내",
        canRetry: false,
      }),
      children: createElement(ApiErrorState, {
        error: new Error("offline"),
        onRetry: () => {},
      }),
    }),
  );

  expect(markup).toContain("공통 오류 제목");
  expect(markup).toContain("공통 오류 안내");
  expect(markup).not.toContain("다시 시도");
  expect(markup.match(/role="alert"/g)).toHaveLength(1);
});

it("shows migration guidance and request ID for unknown settings", () => {
  const markup = renderToStaticMarkup(
    createElement(ApiMutationError, {
      error: new TravelApiError(422, "unknown_setting", "request-123"),
      onRetry: () => {},
    }),
  );

  expect(markup).toContain("설정을 적용할 수 없어요");
  expect(markup).toContain("최신 데이터베이스 마이그레이션");
  expect(markup).toContain("오류 추적 ID:");
  expect(markup).toContain("request-123");
  expect(markup).not.toContain("다시 시도");
});
