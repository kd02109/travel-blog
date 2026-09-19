import { describe, it, expect } from "vitest";
import { postListInputSchema, categorySchema } from "./index";
import { allowsReactions } from "@repo/constants";
describe("API boundaries", () => {
  it("rejects unknown categories and excessive page sizes", () => {
    expect(categorySchema.safeParse("journeys").success).toBe(false);
    expect(
      postListInputSchema.safeParse({
        site_id: "b1181a76-7f7b-4a43-90ab-d8b966ea407b",
        limit: 51,
      }).success,
    ).toBe(false);
  });
  it("uses bounded defaults and excludes PDF reactions", () => {
    expect(
      postListInputSchema.parse({
        site_id: "b1181a76-7f7b-4a43-90ab-d8b966ea407b",
      }),
    ).toMatchObject({ limit: 12, offset: 0 });
    expect(allowsReactions("itinerary-pdf")).toBe(false);
    expect(allowsReactions("day-walk")).toBe(true);
  });
});
