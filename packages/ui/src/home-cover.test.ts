import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";
import { HomeCover, type HomeTemplate } from "./home-cover";

const templates: HomeTemplate[] = ["A", "B", "C", "D"];

test("each design shows the same draft content in its thumbnail and full preview", () => {
  for (const template of templates) {
    for (const desktop of [true, false]) {
      const markup = renderToStaticMarkup(
        createElement(HomeCover, {
          template,
          title: "수정 중인 제주 여행",
          description: "바다 곁에서 보낸 느린 하루",
          siteName: "여행 블로그",
          image: createElement("img", {
            src: "/draft-cover.jpg",
            alt: "선택한 표지 사진",
          }),
          action: createElement(
            "a",
            { href: "/posts/jeju-day" },
            "제주 여행 읽기 ↗",
          ),
          headingAs: "h3",
          headingId: `preview-${template}`,
          desktop,
        }),
      );

      expect(markup).toContain(`data-home-template="${template}"`);
      expect(markup).toContain(`aria-labelledby="preview-${template}"`);
      expect(markup).toContain(`<h3 id="preview-${template}"`);
      expect(markup).toContain("수정 중인 제주 여행");
      expect(markup).toContain("바다 곁에서 보낸 느린 하루");
      expect(markup).toContain("선택한 표지 사진");
      expect(markup).toContain("제주 여행 읽기 ↗");
      expect(markup).toContain('href="/posts/jeju-day"');
      expect(markup.match(/src="\/draft-cover\.jpg"/g)).toHaveLength(1);
    }
  }
});

test("example photo label appears only when the preview uses a sample image", () => {
  const props = {
    template: "D" as const,
    siteName: "여행 블로그",
    image: createElement("img", { src: "/sample.jpg", alt: "예시 풍경" }),
    action: createElement("a", { href: "/posts" }, "여행 펼치기"),
  };

  const sample = renderToStaticMarkup(
    createElement(HomeCover, { ...props, sampleImage: true }),
  );
  const selected = renderToStaticMarkup(
    createElement(HomeCover, { ...props, sampleImage: false }),
  );

  expect(sample).toContain("예시 사진");
  expect(selected).not.toContain("예시 사진");
});

test("an unedited design shows the same fallback copy as the public home", () => {
  const markup = renderToStaticMarkup(
    createElement(HomeCover, {
      template: "D",
      siteName: "여행 블로그",
      image: createElement("img", { src: "/sample.jpg", alt: "예시 풍경" }),
      action: createElement("a", { href: "/posts" }, "여행 펼치기"),
    }),
  );

  expect(markup).toContain("천천히 머물고,");
  expect(markup).toContain("오래 기억하는 여행");
  expect(markup).toContain("여행 블로그의 여행책을 한 장씩 펼쳐 보세요.");
});

test("every design shows four scenes and A previews its next scene", () => {
  for (const template of templates) {
    const markup = renderToStaticMarkup(
      createElement(HomeCover, {
        template,
        siteName: "여행 블로그",
        image: createElement("img", { src: "/scene-1.jpg", alt: "첫 장면" }),
        secondaryImages: [2, 3, 4].map((number) =>
          createElement("img", {
            src: `/scene-${number}.jpg`,
            alt: `${number}번째 장면`,
          }),
        ),
        action: createElement("a", { href: "/posts" }, "여행 읽기"),
      }),
    );

    for (const number of [1, 2, 3, 4]) {
      expect(
        markup.match(new RegExp(`src="/scene-${number}\\.jpg"`, "g")),
      ).toHaveLength(template === "A" && number === 2 ? 2 : 1);
    }
    if (template === "A") {
      expect(markup).toContain('data-home-a-carousel="true"');
      expect(markup).toContain("다음 사진 보기");
      expect(markup).toContain("01 / 04");
    }
  }
});

test("A with one photo does not show carousel navigation", () => {
  const markup = renderToStaticMarkup(
    createElement(HomeCover, {
      template: "A",
      siteName: "여행 블로그",
      image: createElement("img", {
        src: "/only-photo.jpg",
        alt: "한 장의 사진",
      }),
      action: createElement("a", { href: "/posts" }, "여행 읽기"),
    }),
  );

  expect(markup).toContain("01 / 01");
  expect(markup).not.toContain("다음 사진 보기");
  expect(markup).not.toContain("자동 전환 일시정지");
});
