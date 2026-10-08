import { describe, expect, it } from "vitest";
import {
  isIsoDate,
  validateDraftMetadata,
  validatePublishedMetadata,
} from "./post-metadata";

describe("category-specific post metadata", () => {
  it("accepts calendar dates and rejects impossible dates", () => {
    expect(isIsoDate("2024-02-29")).toBe(true);
    expect(isIsoDate("2026-02-29")).toBe(false);
    expect(isIsoDate("2026-2-09")).toBe(false);
  });

  it.each([
    ["day-walk", { region: "서울", visited_on: "2026-09-12" }],
    [
      "overnight-trip",
      { region: "제주", start_date: "2026-09-12", end_date: "2026-09-14" },
    ],
    [
      "food-cafe",
      {
        region: "강릉",
        visited_on: "2026-09-12",
        place_name: "바다 카페",
        venue_type: "cafe",
      },
    ],
    [
      "stay-review",
      {
        region: "제주",
        check_in: "2026-09-12",
        check_out: "2026-09-14",
        place_name: "바다 숙소",
      },
    ],
  ] as const)("accepts complete %s metadata", (category, metadata) => {
    expect(validatePublishedMetadata(category, metadata)).toBeNull();
  });

  it.each([
    ["day-walk", { region: "서울", visited_on: "" }, "missing_date"],
    [
      "overnight-trip",
      { region: "제주", start_date: "2026-09-12", end_date: "2026-09-12" },
      "invalid_dates",
    ],
    [
      "food-cafe",
      {
        region: "강릉",
        visited_on: "2026-09-12",
        place_name: "카페",
        venue_type: "bar",
      },
      "invalid_venue",
    ],
    [
      "stay-review",
      {
        region: "제주",
        check_in: "2026-09-12",
        check_out: "2026-09-14",
        place_name: " ",
      },
      "missing_place",
    ],
  ] as const)("rejects invalid %s metadata", (category, metadata, error) => {
    expect(validatePublishedMetadata(category, metadata)).toBe(error);
  });

  it("allows incomplete drafts while rejecting invalid values that were entered", () => {
    expect(
      validateDraftMetadata("overnight-trip", {
        region: "제주",
        start_date: "2026-09-12",
      }),
    ).toBeNull();
    expect(
      validatePublishedMetadata("overnight-trip", {
        region: "제주",
        start_date: "2026-09-12",
      }),
    ).toBe("invalid_dates");
    expect(
      validateDraftMetadata("stay-review", { check_in: "2026-02-29" }),
    ).toBe("invalid_date");
  });
});
