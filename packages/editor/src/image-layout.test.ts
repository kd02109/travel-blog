import { expect, test } from "vitest";
import {
  dragImageLayout,
  imageAspectRatio,
  imagePairState,
  imagePointerDelta,
  imagePositionPct,
  imageWidthPct,
  minImageWidthPct,
} from "./image-layout";

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

test("legacy image dimensions become percentages only when an edit starts", () => {
  expect(imageWidthPct(0, "small", 800)).toBe(40);
  expect(imageWidthPct(0, "medium", 800)).toBe(65);
  expect(imageWidthPct(0, "large", 800)).toBe(100);
  expect(imageWidthPct(0, "small", 320)).toBe(100);
  expect(imagePositionPct(-1, "left")).toBe(0);
  expect(imagePositionPct(-1, "center")).toBe(50);
  expect(imagePositionPct(-1, "right")).toBe(100);
  expect(imageWidthPct(62.5, "small", 800)).toBe(62.5);
  expect(imagePositionPct(37.5, "right")).toBe(37.5);
});

test("moving an image uses the space left after its width and stays in bounds", () => {
  expect(
    dragImageLayout({ widthPct: 50, positionPct: 50 }, 800, 100, "move"),
  ).toEqual({ widthPct: 50, positionPct: 75 });
  expect(
    dragImageLayout({ widthPct: 50, positionPct: 50 }, 800, 800, "move"),
  ).toEqual({ widthPct: 50, positionPct: 100 });
  expect(
    dragImageLayout({ widthPct: 50, positionPct: 50 }, 800, -800, "move"),
  ).toEqual({ widthPct: 50, positionPct: 0 });
});

test("corner resizing preserves the opposite edge until a document boundary", () => {
  expect(
    dragImageLayout({ widthPct: 50, positionPct: 50 }, 800, 80, "resize-right"),
  ).toEqual({ widthPct: 60, positionPct: 62.5 });
  expect(
    dragImageLayout({ widthPct: 50, positionPct: 50 }, 800, -80, "resize-left"),
  ).toEqual({ widthPct: 60, positionPct: 37.5 });
  expect(
    dragImageLayout(
      { widthPct: 50, positionPct: 50 },
      800,
      800,
      "resize-right",
    ),
  ).toEqual({ widthPct: 100, positionPct: 0 });
  expect(
    dragImageLayout({ widthPct: 50, positionPct: 50 }, 800, 800, "resize-left"),
  ).toEqual({ widthPct: 20, positionPct: 68.8 });
});

test("narrow documents keep resize corners apart with a 160px minimum", () => {
  expect(minImageWidthPct(320)).toBe(50);
  expect(imageWidthPct(20, "large", 320)).toBe(50);
  expect(
    dragImageLayout(
      { widthPct: 50, positionPct: 0 },
      320,
      -300,
      "resize-right",
    ),
  ).toEqual({ widthPct: 50, positionPct: 0 });
  expect(minImageWidthPct(120)).toBe(100);
});

test("paired images start at full cell width and resize within their own column", () => {
  expect(imageWidthPct(0, "small", 500, "pair")).toBe(100);
  expect(imageWidthPct(45, "small", 300, "pair")).toBe(45);
  expect(minImageWidthPct(300, "pair")).toBe(32);
  expect(minImageWidthPct(600, "pair")).toBe(20);
  expect(minImageWidthPct(200, "pair")).toBe(48);
  expect(
    dragImageLayout(
      { widthPct: 100, positionPct: 50 },
      300,
      -90,
      "resize-right",
      "pair",
    ),
  ).toEqual({ widthPct: 70, positionPct: 0 });
  expect(
    dragImageLayout(
      { widthPct: 100, positionPct: 50 },
      300,
      90,
      "resize-left",
      "pair",
    ),
  ).toEqual({ widthPct: 70, positionPct: 100 });
  expect(
    dragImageLayout({ widthPct: 70, positionPct: 0 }, 300, 45, "move", "pair"),
  ).toEqual({ widthPct: 70, positionPct: 50 });
  expect(
    dragImageLayout(
      { widthPct: 70, positionPct: 50 },
      200,
      -200,
      "resize-right",
      "pair",
    ),
  ).toEqual({ widthPct: 48, positionPct: 28.8 });
});

test("corner drag converts vertical motion through the image aspect ratio", () => {
  expect(imageAspectRatio(1200, 600)).toBe(2);
  expect(imageAspectRatio(0, 0)).toBe(1.5);
  expect(imagePointerDelta("move", 20, 80, 2)).toBe(20);
  expect(imagePointerDelta("resize-right", 20, 30, 2)).toBe(60);
  expect(imagePointerDelta("resize-left", -20, 30, 2)).toBe(-60);
  expect(imagePointerDelta("resize-right", -70, 20, 2)).toBe(-70);
  expect(imagePointerDelta("resize-left", 70, 20, 2)).toBe(70);
  expect(imagePointerDelta("resize-right", 30, 20, 1.5)).toBe(30);
});
