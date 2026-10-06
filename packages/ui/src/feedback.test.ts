import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { ErrorState } from "./feedback";

it("disables a retry while it is pending and names the state", () => {
  const markup = renderToStaticMarkup(
    createElement(ErrorState, {
      description: "서버 연결에 실패했어요.",
      onRetry: () => {},
      retryPending: true,
    }),
  );

  expect(markup).toContain('role="alert"');
  expect(markup).toContain('aria-busy="true"');
  expect(markup).toContain("다시 시도 중…");
  expect(markup).toContain("disabled");
});

it("shows guidance without a retry action when none was supplied", () => {
  const markup = renderToStaticMarkup(
    createElement(ErrorState, {
      title: "권한이 없어요",
      description: "계정을 확인해 주세요.",
      compact: true,
    }),
  );

  expect(markup).toContain("권한이 없어요");
  expect(markup).toContain("계정을 확인해 주세요.");
  expect(markup).not.toContain("다시 시도");
  expect(markup).not.toContain("<button");
});
