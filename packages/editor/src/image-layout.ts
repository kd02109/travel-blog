type ImageLayoutBlock = {
  id: string;
  type: string;
  props?: { layout?: string };
};

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
