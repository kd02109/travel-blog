import { describe, expect, it } from "vitest";
import { hasUnpublishedChanges } from "./post-publication";

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
