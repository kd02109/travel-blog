import { expect, test } from "vitest";
import { imagePairState } from "./image-layout";

test("adjacent paired photos share a row and an odd leftover stays single", () => {
  const photos = [
    { id: "a", type: "image", props: { layout: "pair" } },
    { id: "b", type: "image", props: { layout: "pair" } },
    { id: "c", type: "image", props: { layout: "pair" } },
  ];
  expect(imagePairState(photos, "a").partnerIndex).toBe(1);
  expect(imagePairState(photos, "b").partnerIndex).toBe(0);
  expect(imagePairState(photos, "c").partnerIndex).toBe(-1);
});

test("a photo can pair only with the next adjacent single photo", () => {
  const blocks = [
    { id: "a", type: "image", props: { layout: "single" } },
    { id: "b", type: "image", props: { layout: "single" } },
    { id: "text", type: "paragraph" },
    { id: "c", type: "image", props: { layout: "single" } },
  ];
  expect(imagePairState(blocks, "a").canPair).toBe(true);
  expect(imagePairState(blocks, "b").canPair).toBe(false);
  expect(imagePairState(blocks, "c").canPair).toBe(false);
});
