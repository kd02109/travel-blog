import { describe, expect, it } from "vitest";
import {
  hasUnpublishedChanges,
  publicationChecklist,
} from "./post-publication";

describe("publicationChecklist", () => {
  const article = {
    kind: "article" as const,
    title: "제주 여행",
    slug: "jeju-trip",
    tags: ["제주"],
    category: "day-walk" as const,
    metadata: { region: "제주", visited_on: "2026-10-06" },
    hasBodyContent: true,
    coverAssetId: "cover-id",
    pdfAssetId: "",
  };

  it("rejects missing travel details before asking to publish", () => {
    const checks = publicationChecklist({ ...article, metadata: {} });
    expect(
      checks.find((check) => check.label === "분류별 여행 정보")?.valid,
    ).toBe(false);
    expect(checks.filter((check) => !check.valid)).toHaveLength(1);
  });

  it("matches title, slug, and tag restrictions on the publish endpoint", () => {
    const checks = publicationChecklist({
      ...article,
      slug: "제주-여행",
      tags: ["x".repeat(31)],
    });
    expect(
      checks.filter((check) => !check.valid).map((check) => check.label),
    ).toEqual(["주소 이름", "태그"]);
  });

  it("accepts a complete article and requires a PDF for an itinerary", () => {
    expect(publicationChecklist(article).every((check) => check.valid)).toBe(
      true,
    );
    expect(
      publicationChecklist({ ...article, kind: "pdf", pdfAssetId: "" }).find(
        (check) => check.label === "일정 PDF 파일",
      )?.valid,
    ).toBe(false);
  });
});

describe("hasUnpublishedChanges", () => {
  it("reports a clean draft immediately after publishing its saved snapshot", () => {
    const savedDraft = {
      title: "여행",
      slug: "travel",
      blocks: [{ id: "block-1", type: "paragraph", content: "바다를 보았다" }],
      cover_asset_id: null,
    };
    const publishedSnapshot = JSON.parse(JSON.stringify(savedDraft)) as Record<
      string,
      unknown
    >;
    expect(hasUnpublishedChanges(savedDraft, publishedSnapshot)).toBe(false);
  });

  it("ignores object key order when comparing the saved draft and public snapshot", () => {
    expect(
      hasUnpublishedChanges(
        {
          title: "여행",
          metadata: { region: "제주", visited_on: "2026-10-06" },
        },
        {
          metadata: { visited_on: "2026-10-06", region: "제주" },
          title: "여행",
        },
      ),
    ).toBe(false);
  });

  it("detects changed image layout and caption in a saved draft", () => {
    const published = {
      title: "여행",
      blocks: [
        {
          type: "image",
          props: { asset_id: "photo", caption: "나무", layout: "single" },
        },
      ],
    };
    expect(
      hasUnpublishedChanges(
        {
          ...published,
          blocks: [
            {
              type: "image",
              props: {
                asset_id: "photo",
                caption: "오래된 나무",
                layout: "pair",
              },
            },
          ],
        },
        published,
      ),
    ).toBe(true);
  });

  it("detects a changed title even when the body is unchanged", () => {
    expect(
      hasUnpublishedChanges(
        { title: "새 제목", blocks: [] },
        { title: "옛 제목", blocks: [] },
      ),
    ).toBe(true);
  });
});
