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

const MIN_IMAGE_WIDTH_PCT = 20;
const MIN_IMAGE_WIDTH_PX = 160;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function rounded(value: number) {
  return Math.round(value * 10) / 10;
}

export function minImageWidthPct(containerWidth: number) {
  if (!Number.isFinite(containerWidth) || containerWidth <= 0)
    return MIN_IMAGE_WIDTH_PCT;
  return Math.min(
    100,
    Math.max(MIN_IMAGE_WIDTH_PCT, (MIN_IMAGE_WIDTH_PX / containerWidth) * 100),
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
) {
  const minimum = minImageWidthPct(containerWidth);
  if (Number.isFinite(widthPct) && widthPct >= MIN_IMAGE_WIDTH_PCT)
    return clamp(widthPct, minimum, 100);
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
): ImagePercentLayout {
  if (!Number.isFinite(containerWidth) || containerWidth <= 0) return start;
  const minimum = minImageWidthPct(containerWidth);
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
