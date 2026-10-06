type ImageLayoutBlock = {
  id: string;
  type: string;
  props?: { layout?: string };
};

export type ImageDragMode = "move" | "resize-left" | "resize-right";

export type ImagePercentLayout = {
  widthPct: number;
  positionPct: number;
};

const MIN_PAIR_SHARE_PCT = 20;
const MIN_PAIRED_IMAGE_WIDTH_PX = 96;
const PAIR_GAP_PX = 16;

function validPairShare(value: number) {
  return Number.isFinite(value) && value >= 20 && value <= 80;
}

function pairWidthWeight(value: number) {
  return Number.isFinite(value) && value >= 20 && value <= 100 ? value : 100;
}

/** Explicit shares take precedence; old paired widths supply a split until edited. */
export function firstPairSharePct(
  firstSharePct: number,
  secondSharePct: number,
  firstWidthPct: number,
  secondWidthPct: number,
) {
  if (validPairShare(firstSharePct)) return firstSharePct;
  if (validPairShare(secondSharePct)) return 100 - secondSharePct;
  const firstWeight = pairWidthWeight(firstWidthPct);
  const secondWeight = pairWidthWeight(secondWidthPct);
  return rounded(
    clamp(
      (firstWeight / (firstWeight + secondWeight)) * 100,
      MIN_PAIR_SHARE_PCT,
      100 - MIN_PAIR_SHARE_PCT,
    ),
  );
}

/** Each flex item includes half the row gap as padding. */
export function minPairSharePct(rowWidth: number) {
  if (!Number.isFinite(rowWidth) || rowWidth <= 0) return MIN_PAIR_SHARE_PCT;
  return Math.min(
    50,
    Math.max(
      MIN_PAIR_SHARE_PCT,
      ((MIN_PAIRED_IMAGE_WIDTH_PX + PAIR_GAP_PX / 2) / rowWidth) * 100,
    ),
  );
}

export function dragPairSharePct(
  startSharePct: number,
  rowWidth: number,
  deltaX: number,
  edge: "left" | "right",
) {
  if (!Number.isFinite(rowWidth) || rowWidth <= 0) return startSharePct;
  const minimum = minPairSharePct(rowWidth);
  const direction = edge === "left" ? -1 : 1;
  return rounded(
    clamp(
      startSharePct + (deltaX * direction * 100) / rowWidth,
      minimum,
      100 - minimum,
    ),
  );
}

export function imageAspectRatio(naturalWidth: number, naturalHeight: number) {
  return Number.isFinite(naturalWidth) &&
    Number.isFinite(naturalHeight) &&
    naturalWidth > 0 &&
    naturalHeight > 0
    ? naturalWidth / naturalHeight
    : 1.5;
}

/** A corner follows whichever pointer axis requests the larger width change. */
export function imagePointerDelta(
  mode: ImageDragMode,
  deltaX: number,
  deltaY: number,
  aspectRatio: number,
) {
  if (mode === "move") return deltaX;
  const edgeDirection = mode === "resize-left" ? -1 : 1;
  const horizontalGrowth = deltaX * edgeDirection;
  const verticalGrowth = deltaY * aspectRatio;
  const growth =
    Math.abs(verticalGrowth) > Math.abs(horizontalGrowth)
      ? verticalGrowth
      : horizontalGrowth;
  return growth * edgeDirection;
}

const MIN_IMAGE_WIDTH_PCT = 20;
const MIN_IMAGE_WIDTH_PX = 160;

export type ImageLayoutMode = "single" | "pair";

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function rounded(value: number) {
  return Math.round(value * 10) / 10;
}

export function minImageWidthPct(
  containerWidth: number,
  layout: ImageLayoutMode = "single",
) {
  if (!Number.isFinite(containerWidth) || containerWidth <= 0)
    return MIN_IMAGE_WIDTH_PCT;
  return Math.min(
    100,
    Math.max(
      MIN_IMAGE_WIDTH_PCT,
      ((layout === "pair" ? MIN_PAIRED_IMAGE_WIDTH_PX : MIN_IMAGE_WIDTH_PX) /
        containerWidth) *
        100,
    ),
  );
}

export function legacyImageWidthPx(
  width: "small" | "medium" | "large",
  containerWidth: number,
) {
  return Math.min(
    containerWidth,
    width === "small" ? 320 : width === "medium" ? 520 : containerWidth,
  );
}

export function imagePositionPct(
  positionPct: number,
  align: "left" | "center" | "right",
) {
  if (Number.isFinite(positionPct) && positionPct >= 0)
    return clamp(positionPct, 0, 100);
  return align === "left" ? 0 : align === "right" ? 100 : 50;
}

export function imageWidthPct(
  widthPct: number,
  width: "small" | "medium" | "large",
  containerWidth: number,
  layout: ImageLayoutMode = "single",
) {
  const minimum = minImageWidthPct(containerWidth, layout);
  if (Number.isFinite(widthPct) && widthPct >= MIN_IMAGE_WIDTH_PCT)
    return clamp(widthPct, minimum, 100);
  // Existing paired images filled their entire grid cell regardless of the old
  // small/medium width setting. Keep that appearance until the first edit.
  if (layout === "pair") return 100;
  if (containerWidth <= 0) return 100;
  return clamp(
    (legacyImageWidthPx(width, containerWidth) / containerWidth) * 100,
    minimum,
    100,
  );
}

/** Position is a percentage of the *remaining* width, not the whole document. */
export function dragImageLayout(
  start: ImagePercentLayout,
  containerWidth: number,
  deltaX: number,
  mode: ImageDragMode,
  layout: ImageLayoutMode = "single",
): ImagePercentLayout {
  if (!Number.isFinite(containerWidth) || containerWidth <= 0) return start;
  const minimum = minImageWidthPct(containerWidth, layout);
  const startWidth =
    (clamp(start.widthPct, minimum, 100) / 100) * containerWidth;
  const startRemaining = containerWidth - startWidth;
  const startLeft = (clamp(start.positionPct, 0, 100) / 100) * startRemaining;
  if (mode === "move") {
    const nextLeft = clamp(startLeft + deltaX, 0, startRemaining);
    return {
      widthPct: rounded((startWidth / containerWidth) * 100),
      positionPct: rounded(
        startRemaining <= 0 ? 0 : (nextLeft / startRemaining) * 100,
      ),
    };
  }

  const direction = mode === "resize-left" ? -1 : 1;
  const nextWidth =
    (clamp(
      ((startWidth + deltaX * direction) / containerWidth) * 100,
      minimum,
      100,
    ) /
      100) *
    containerWidth;
  const nextRemaining = containerWidth - nextWidth;
  const nextLeft =
    mode === "resize-left"
      ? clamp(startLeft + startWidth - nextWidth, 0, nextRemaining)
      : clamp(startLeft, 0, nextRemaining);
  return {
    widthPct: rounded((nextWidth / containerWidth) * 100),
    positionPct: rounded(
      nextRemaining <= 0 ? 0 : (nextLeft / nextRemaining) * 100,
    ),
  };
}

export function imagePairState(blocks: ImageLayoutBlock[], blockId: string) {
  const index = blocks.findIndex((item) => item.id === blockId);
  if (index < 0) return { partnerIndex: -1, canPair: false, next: undefined };
  const current = blocks[index]!;
  const next = blocks[index + 1];
  let partnerIndex = -1;
  if (current.type === "image" && current.props?.layout === "pair") {
    let start = index;
    while (
      start > 0 &&
      blocks[start - 1]?.type === "image" &&
      blocks[start - 1]?.props?.layout === "pair"
    )
      start--;
    const candidate = (index - start) % 2 === 0 ? index + 1 : index - 1;
    if (
      blocks[candidate]?.type === "image" &&
      blocks[candidate]?.props?.layout === "pair"
    )
      partnerIndex = candidate;
  }
  return {
    partnerIndex,
    canPair:
      current.type === "image" &&
      current.props?.layout === "single" &&
      next?.type === "image" &&
      next?.props?.layout === "single",
    next,
  };
}
