"use client";
import {
  BlockNoteSchema,
  defaultBlockSpecs,
  type PartialBlock,
} from "@blocknote/core";
import { ko } from "@blocknote/core/locales";
import { useCreateBlockNote } from "@blocknote/react";
import { useEditorSelectionChange } from "@blocknote/react";
import { BlockNoteView } from "@blocknote/shadcn";
import { createReactBlockSpec } from "@blocknote/react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import type {
  ReactNode,
  DragEvent,
  KeyboardEvent as ReactKeyboardEvent,
  PointerEvent as ReactPointerEvent,
} from "react";
import {
  FormattingToolbar,
  FormattingToolbarController,
  getFormattingToolbarItems,
} from "@blocknote/react";
import {
  dragPairSharePct,
  dragImageLayout,
  firstPairSharePct,
  imageAspectRatio,
  imagePairState,
  imagePointerDelta,
  imagePositionPct,
  imageWidthPct,
  minImageWidthPct,
  minPairSharePct,
  type ImageDragMode,
  type ImageLayoutMode,
  type ImagePercentLayout,
} from "./image-layout";

const ACCEPTED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_IMAGE_SIZE = 20 * 1024 * 1024;

const inlineStyleIcons = {
  bold: (
    <path d="M7 5h6a4 4 0 0 1 2.6 7A4.5 4.5 0 0 1 13 20H7V5Zm2.5 2.5v3.7H13a1.9 1.9 0 1 0 0-3.7H9.5Zm0 6.2v3.8H13a1.9 1.9 0 1 0 0-3.8H9.5Z" />
  ),
  italic: (
    <path d="M14.5 5h5v2h-2.2l-3.6 10H16v2h-5v-2h2.2l3.6-10H14.5V5ZM5 19h5v-2H5v2ZM5 7h5V5H5v2Z" />
  ),
  underline: (
    <path d="M7 4v6a5 5 0 0 0 10 0V4h-2v6a3 3 0 0 1-6 0V4H7Zm-1 15h12v2H6v-2Z" />
  ),
  strike: (
    <path d="M4 11h16v2H4v-2Zm3.1-3.7C7.1 5.4 8.7 4 11 4c2 0 3.7.8 4.7 2.2l-1.6 1.2C13.5 6.5 12.4 6 11 6c-1.3 0-2 .6-2 1.4 0 .6.4 1 1.2 1.4H6.6c-.9-.7-1.5-1.5-1.5-2.5Zm9.8 9.3c0 2-1.7 3.4-4.1 3.4-2 0-3.8-.7-5-2.1l1.5-1.3c.9 1 2.1 1.5 3.5 1.5 1.4 0 2.1-.6 2.1-1.4 0-.6-.4-1-1.2-1.4h3c.1.4.2.8.2 1.3Z" />
  ),
} as const;

const blockStyleIcons = {
  paragraph: (
    <path d="M13 4a8 8 0 1 0 0 16h2v-6h3V8a4 4 0 0 0-4-4h-1Zm0 2h1a2 2 0 0 1 2 2v6h-3a6 6 0 1 1 0-12Z" />
  ),
  heading1: (
    <>
      <path d="M5 5v14h2v-6h6v6h2V5h-2v6H7V5H5Z" />
      <path d="M17 8h2v11h-2z" />
    </>
  ),
  heading2: (
    <>
      <path d="M4 5v14h2v-6h6v6h2V5h-2v6H6V5H4Z" />
      <path d="M17 10c0-1.2.8-2 2-2s2 .8 2 2c0 .8-.5 1.5-1.2 2.2L17 15v2h5v-2h-2.1l1.3-1.4c1-1 1.8-2 1.8-3.6 0-2.3-1.7-4-4-4s-4 1.7-4 4h2Z" />
    </>
  ),
  heading3: (
    <>
      <path d="M3 5v14h2v-6h6v6h2V5h-2v6H5V5H3Z" />
      <path d="M16 8h5v1.5l-2 2c1.3.2 2.2 1.1 2.2 2.4 0 1.9-1.5 3.2-3.6 3.2-1.3 0-2.4-.4-3.2-1.2l1.2-1.3c.5.5 1.2.8 2 .8 1 0 1.6-.5 1.6-1.3 0-.7-.6-1.1-1.6-1.1h-.8v-1.3l1.8-1.9H16V8Z" />
    </>
  ),
  bulletListItem: (
    <>
      <circle cx="5" cy="7" r="1.5" />
      <circle cx="5" cy="12" r="1.5" />
      <circle cx="5" cy="17" r="1.5" />
      <path d="M9 6h11v2H9zM9 11h11v2H9zM9 16h11v2H9z" />
    </>
  ),
  numberedListItem: (
    <>
      <path d="M3.5 6h2v3h-2V8h1V7h-1V6Zm0 6H6v1l-1.2 1H6v1H3.5v-1l1.2-1H3.5v-1Zm-.2 5h2.8v1H4.5v.5h1.2v.8H4.5v.5h1.6v1H3.3v-3.8Z" />
      <path d="M9 6h11v2H9zM9 12h11v2H9zM9 18h11v2H9z" />
    </>
  ),
  quote: <path d="M7 6H4v6h5V8H6V7h5V5H7Zm9 0h-3v6h5V8h-3V7h5V5h-4Z" />,
  codeBlock: (
    <path d="m8 7-5 5 5 5 1.4-1.4L5.8 12l3.6-3.6L8 7Zm8 0-1.4 1.4 3.6 3.6-3.6 3.6L16 17l5-5-5-5Z" />
  ),
} as const;

const ImagePreviewContext = createContext<
  | {
      renderPreview?: (assetId: string) => ReactNode;
      editable: boolean;
      documentVersion: number;
      pairDrafts: Record<string, number>;
      setPairDraft: (
        blockId: string,
        partnerId: string,
        sharePct: number | null,
      ) => void;
    }
  | undefined
>(undefined);

type ImagePointerSession = {
  pointerId: number;
  startX: number;
  startY: number;
  aspectRatio: number;
  containerWidth: number;
  start: ImagePercentLayout;
  mode: ImageDragMode;
  layout: ImageLayoutMode;
  partnerId?: string;
};

function AssetImage({
  blockId,
  assetId,
  caption,
  width,
  align,
  widthPct,
  positionPct,
  pairSharePct,
  layout,
  onCaptionChange,
  onLayoutChange,
  onPairShareChange,
  onPairToggle,
  getPairState,
}: {
  blockId: string;
  assetId: string;
  caption: string;
  width: "small" | "medium" | "large";
  align: "left" | "center" | "right";
  widthPct: number;
  positionPct: number;
  pairSharePct: number;
  layout: "single" | "pair";
  onCaptionChange: (caption: string) => void;
  onLayoutChange: (layout: ImagePercentLayout) => void;
  onPairShareChange: (sharePct: number) => boolean;
  onPairToggle: () => void;
  getPairState: () => {
    canPair: boolean;
    paired: boolean;
    partnerId?: string;
    partnerWidthPct?: number;
    partnerSharePct?: number;
    side?: "first" | "second";
  };
}) {
  const {
    renderPreview,
    editable = true,
    pairDrafts = {},
    setPairDraft,
  } = useContext(ImagePreviewContext) ?? {};
  const {
    canPair,
    paired,
    partnerId,
    partnerWidthPct = 0,
    partnerSharePct = 0,
    side,
  } = getPairState();
  const hasPairSetting = paired || layout === "pair";
  const activeLayout: ImageLayoutMode = paired ? "pair" : "single";
  const firstSharePct = firstPairSharePct(
    side === "first" ? pairSharePct : partnerSharePct,
    side === "first" ? partnerSharePct : pairSharePct,
    side === "first" ? widthPct : partnerWidthPct,
    side === "first" ? partnerWidthPct : widthPct,
  );
  const preferredPairSharePct =
    pairDrafts[blockId] ??
    (side === "first" ? firstSharePct : 100 - firstSharePct);
  const slotRef = useRef<HTMLDivElement>(null);
  const pointerSession = useRef<ImagePointerSession | null>(null);
  const [draftLayout, setDraftLayout] = useState<ImagePercentLayout | null>(
    null,
  );
  const [containerWidth, setContainerWidth] = useState(0);
  const [rowWidth, setRowWidth] = useState(0);
  const minPairShare = minPairSharePct(rowWidth);
  const ownPairSharePct = Math.min(
    100 - minPairShare,
    Math.max(minPairShare, preferredPairSharePct),
  );
  const pairRowStacked = paired && rowWidth > 0 && rowWidth < 208;
  const hintId = useId();
  const hasCustomLayout =
    Number.isFinite(widthPct) &&
    widthPct >= 20 &&
    widthPct <= 100 &&
    Number.isFinite(positionPct) &&
    positionPct >= 0 &&
    positionPct <= 100;
  const displayedPosition =
    draftLayout?.positionPct ??
    imagePositionPct(hasCustomLayout ? positionPct : -1, align);
  const displayedWidth =
    draftLayout?.widthPct ?? (hasCustomLayout ? widthPct : null);

  useLayoutEffect(() => {
    if (
      !paired ||
      typeof CSSStyleSheet === "undefined" ||
      !("adoptedStyleSheets" in document)
    )
      return;
    // Keep layout rules outside ProseMirror's DOM observer. Mutating the block
    // wrapper's style attribute feeds back into editor change notifications.
    const sheet = new CSSStyleSheet();
    sheet.replaceSync(
      `.writer-editor .bn-block-outer:has(.writer-image[data-pair-token="${hintId}"]) { --pair-share: ${ownPairSharePct}%; }`,
    );
    document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];
    return () => {
      document.adoptedStyleSheets = document.adoptedStyleSheets.filter(
        (entry) => entry !== sheet,
      );
    };
  }, [hintId, ownPairSharePct, paired]);

  useEffect(() => {
    const draftShare = pairDrafts[blockId];
    if (
      draftShare === undefined ||
      pointerSession.current ||
      !partnerId ||
      pairSharePct !== draftShare ||
      partnerSharePct !== pairDrafts[partnerId]
    )
      return;
    const timer = window.setTimeout(
      () => setPairDraft?.(blockId, partnerId, null),
      0,
    );
    return () => window.clearTimeout(timer);
  }, [
    blockId,
    pairDrafts,
    pairSharePct,
    partnerId,
    partnerSharePct,
    setPairDraft,
  ]);

  const readLayout = () => {
    const containerWidth = slotRef.current?.getBoundingClientRect().width ?? 0;
    if (containerWidth <= 0) return null;
    return {
      containerWidth,
      layout: {
        widthPct:
          draftLayout?.widthPct ??
          imageWidthPct(
            hasCustomLayout ? widthPct : 0,
            width,
            containerWidth,
            activeLayout,
          ),
        positionPct:
          draftLayout?.positionPct ??
          imagePositionPct(hasCustomLayout ? positionPct : -1, align),
      },
    };
  };

  const beginDrag = (
    mode: ImageDragMode,
    event: ReactPointerEvent<HTMLElement>,
  ) => {
    if (!editable || pointerSession.current) return;
    if (paired && (mode === "move" || !partnerId || pairRowStacked)) return;
    if (event.pointerType === "mouse" && event.button !== 0) return;
    if (
      mode === "move" &&
      event.target instanceof Element &&
      event.target.closest("button, input, a, textarea")
    )
      return;
    const current = paired ? null : readLayout();
    const rowWidth = paired
      ? (slotRef.current
          ?.closest<HTMLElement>(".bn-block-group")
          ?.getBoundingClientRect().width ?? 0)
      : 0;
    if (!current && rowWidth <= 0) return;
    const image = slotRef.current?.querySelector("img");
    pointerSession.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      aspectRatio: imageAspectRatio(
        image?.naturalWidth ?? 0,
        image?.naturalHeight ?? 0,
      ),
      containerWidth: paired ? rowWidth : current!.containerWidth,
      start: paired
        ? { widthPct: ownPairSharePct, positionPct: 0 }
        : current!.layout,
      mode,
      layout: activeLayout,
      partnerId: paired ? partnerId : undefined,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    event.preventDefault();
    event.stopPropagation();
  };

  const moveDrag = (event: ReactPointerEvent<HTMLElement>) => {
    const session = pointerSession.current;
    if (!session || session.pointerId !== event.pointerId) return;
    if (session.layout === "pair" && session.partnerId) {
      const nextShare = dragPairSharePct(
        session.start.widthPct,
        session.containerWidth,
        imagePointerDelta(
          session.mode,
          event.clientX - session.startX,
          event.clientY - session.startY,
          session.aspectRatio,
        ),
        session.mode === "resize-left" ? "left" : "right",
      );
      setPairDraft?.(blockId, session.partnerId, nextShare);
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    const next = dragImageLayout(
      session.start,
      session.containerWidth,
      imagePointerDelta(
        session.mode,
        event.clientX - session.startX,
        event.clientY - session.startY,
        session.aspectRatio,
      ),
      session.mode,
      session.layout,
    );
    setDraftLayout(next);
    event.preventDefault();
    event.stopPropagation();
  };

  const endDrag = (event: ReactPointerEvent<HTMLElement>) => {
    const session = pointerSession.current;
    if (!session || session.pointerId !== event.pointerId) return;
    pointerSession.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
    setDraftLayout(null);
    const delta = imagePointerDelta(
      session.mode,
      event.clientX - session.startX,
      event.clientY - session.startY,
      session.aspectRatio,
    );
    if (session.layout === "pair" && session.partnerId) {
      const nextShare = dragPairSharePct(
        session.start.widthPct,
        session.containerWidth,
        delta,
        session.mode === "resize-left" ? "left" : "right",
      );
      if (
        Math.abs(delta) >= 2 &&
        nextShare !== session.start.widthPct &&
        onPairShareChange(nextShare)
      ) {
        setPairDraft?.(blockId, session.partnerId, nextShare);
      } else setPairDraft?.(blockId, session.partnerId, null);
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    if (Math.abs(delta) >= 2) {
      const next = dragImageLayout(
        session.start,
        session.containerWidth,
        delta,
        session.mode,
        session.layout,
      );
      if (
        next.widthPct !== session.start.widthPct ||
        next.positionPct !== session.start.positionPct
      )
        onLayoutChange(next);
    }
    event.preventDefault();
    event.stopPropagation();
  };

  const cancelDrag = (event: ReactPointerEvent<HTMLElement>) => {
    const session = pointerSession.current;
    if (session?.pointerId !== event.pointerId) return;
    pointerSession.current = null;
    setDraftLayout(null);
    if (session.partnerId) setPairDraft?.(blockId, session.partnerId, null);
  };

  useEffect(() => {
    const slot = slotRef.current;
    if (!slot || typeof ResizeObserver === "undefined") return;
    const row = slot.closest<HTMLElement>(".bn-block-group");
    let previousWidth = slot.getBoundingClientRect().width;
    const observer = new ResizeObserver(() => {
      const nextWidth = slot.getBoundingClientRect().width;
      setRowWidth(row?.getBoundingClientRect().width ?? 0);
      if (
        Math.abs(nextWidth - previousWidth) > 1 &&
        pointerSession.current?.layout === "single"
      ) {
        pointerSession.current = null;
        setDraftLayout(null);
      }
      previousWidth = nextWidth;
      setContainerWidth(nextWidth);
    });
    observer.observe(slot);
    if (row) observer.observe(row);
    return () => observer.disconnect();
  }, []);

  const changePositionWithKeyboard = (
    event: ReactKeyboardEvent<HTMLElement>,
  ) => {
    if (!editable || paired || event.target !== event.currentTarget) return;
    const current = readLayout();
    if (!current) return;
    const step = event.shiftKey ? 10 : 5;
    const nextPosition =
      event.key === "ArrowLeft"
        ? Math.max(0, current.layout.positionPct - step)
        : event.key === "ArrowRight"
          ? Math.min(100, current.layout.positionPct + step)
          : event.key === "Home"
            ? 0
            : event.key === "End"
              ? 100
              : null;
    if (nextPosition === null) return;
    event.preventDefault();
    event.stopPropagation();
    if (nextPosition !== current.layout.positionPct)
      onLayoutChange({ ...current.layout, positionPct: nextPosition });
  };

  const changeWidthWithKeyboard = (
    edge: "left" | "right",
    event: ReactKeyboardEvent<HTMLElement>,
  ) => {
    if (!editable || pairRowStacked) return;
    const current = readLayout();
    if (!current) return;
    const outward = edge === "left" ? -1 : 1;
    let direction: number;
    if (event.key === "ArrowUp") direction = outward;
    else if (event.key === "ArrowDown") direction = -outward;
    else if (event.key === "ArrowLeft") direction = -1;
    else if (event.key === "ArrowRight") direction = 1;
    else if (event.key === "Home") direction = -outward * 100;
    else if (event.key === "End") direction = outward * 100;
    else return;
    event.preventDefault();
    event.stopPropagation();
    if (paired) {
      const rowWidth =
        slotRef.current
          ?.closest<HTMLElement>(".bn-block-group")
          ?.getBoundingClientRect().width ?? 0;
      if (rowWidth <= 0) return;
      const nextShare = dragPairSharePct(
        ownPairSharePct,
        rowWidth,
        rowWidth * (event.shiftKey ? 0.1 : 0.05) * direction,
        edge,
      );
      if (nextShare !== ownPairSharePct) onPairShareChange(nextShare);
      return;
    }
    const next = dragImageLayout(
      current.layout,
      current.containerWidth,
      current.containerWidth * (event.shiftKey ? 0.1 : 0.05) * direction,
      edge === "left" ? "resize-left" : "resize-right",
      activeLayout,
    );
    if (
      next.widthPct !== current.layout.widthPct ||
      next.positionPct !== current.layout.positionPct
    )
      onLayoutChange(next);
  };

  return (
    <div className="writer-image-slot" ref={slotRef}>
      <figure
        className="writer-image"
        data-pair-token={hintId}
        data-image-width={width}
        data-image-layout={activeLayout}
        data-image-pair-side={paired ? side : undefined}
        data-image-row-stacked={pairRowStacked ? "true" : undefined}
        data-image-dragging={
          draftLayout || pairDrafts[blockId] !== undefined ? "true" : undefined
        }
        style={
          paired
            ? undefined
            : {
                width:
                  displayedWidth === null ? undefined : `${displayedWidth}%`,
                left: `${displayedPosition}%`,
                transform: `translateX(-${displayedPosition}%)`,
              }
        }
      >
        {editable && (
          <div className="writer-image-toolbar" aria-label="사진 배치 설정">
            <span className="writer-image-hint" id={hintId}>
              {paired
                ? "모서리를 끌어 두 사진의 열 너비 조절"
                : "사진을 끌어 위치 이동 · 모서리를 끌어 크기 조절"}
            </span>
            <button
              className="writer-image-pair-button"
              type="button"
              aria-label={
                hasPairSetting
                  ? "사진 나란히 배치 해제"
                  : "다음 사진과 나란히 배치"
              }
              aria-pressed={hasPairSetting}
              title={
                canPair || hasPairSetting
                  ? undefined
                  : "바로 다음 블록에 사진을 넣으면 묶을 수 있습니다"
              }
              disabled={!canPair && !hasPairSetting}
              onMouseDown={(event) => event.preventDefault()}
              onClick={(event) => {
                event.stopPropagation();
                onPairToggle();
              }}
            >
              {hasPairSetting ? "나란히 해제" : "다음 사진과 나란히"}
            </button>
          </div>
        )}
        <div className="writer-image-media-wrap">
          <div
            className="writer-image-media"
            role={editable && !paired ? "slider" : undefined}
            aria-label={editable && !paired ? "사진 가로 위치" : undefined}
            aria-describedby={editable && !paired ? hintId : undefined}
            aria-valuemin={editable && !paired ? 0 : undefined}
            aria-valuemax={editable && !paired ? 100 : undefined}
            aria-valuenow={
              editable && !paired ? Math.round(displayedPosition) : undefined
            }
            tabIndex={editable && !paired ? 0 : undefined}
            onPointerDown={(event) => beginDrag("move", event)}
            onPointerMove={moveDrag}
            onPointerUp={endDrag}
            onPointerCancel={cancelDrag}
            onLostPointerCapture={cancelDrag}
            onKeyDown={changePositionWithKeyboard}
            onDragStart={(event) => {
              if (editable) event.preventDefault();
            }}
          >
            {renderPreview?.(assetId) ?? (
              <p className="text-muted-foreground text-sm">
                사진을 불러오는 중…
              </p>
            )}
          </div>
          {editable && (
            <>
              {(["left", "right"] as const).map((edge) => (
                <div
                  key={edge}
                  className={`writer-image-resize-handle writer-image-resize-handle-${edge}`}
                  role="slider"
                  tabIndex={0}
                  aria-label={
                    paired
                      ? `사진 ${edge === "left" ? "왼쪽" : "오른쪽"} 모서리에서 열 너비 조절`
                      : `사진 ${edge === "left" ? "왼쪽" : "오른쪽"} 모서리에서 폭 조절`
                  }
                  aria-describedby={hintId}
                  aria-valuemin={Math.floor(
                    paired
                      ? minPairSharePct(rowWidth)
                      : minImageWidthPct(containerWidth, activeLayout),
                  )}
                  aria-valuemax={
                    paired ? 100 - Math.floor(minPairSharePct(rowWidth)) : 100
                  }
                  aria-valuenow={
                    paired
                      ? Math.round(ownPairSharePct)
                      : Math.round(
                          imageWidthPct(
                            displayedWidth ?? 0,
                            width,
                            containerWidth,
                            activeLayout,
                          ),
                        )
                  }
                  onPointerDown={(event) =>
                    beginDrag(
                      edge === "left" ? "resize-left" : "resize-right",
                      event,
                    )
                  }
                  onPointerMove={moveDrag}
                  onPointerUp={endDrag}
                  onPointerCancel={cancelDrag}
                  onLostPointerCapture={cancelDrag}
                  onKeyDown={(event) => changeWidthWithKeyboard(edge, event)}
                />
              ))}
            </>
          )}
        </div>
        <figcaption>
          {editable ? (
            <input
              aria-label="사진 설명"
              placeholder="사진 설명 추가"
              maxLength={160}
              value={caption}
              onChange={(event) => onCaptionChange(event.currentTarget.value)}
              onKeyDown={(event) => event.stopPropagation()}
            />
          ) : caption ? (
            caption
          ) : null}
        </figcaption>
      </figure>
    </div>
  );
}

const assetImage = createReactBlockSpec(
  {
    type: "image",
    propSchema: {
      asset_id: { default: "" },
      caption: { default: "" },
      width: {
        default: "large" as const,
        values: ["small", "medium", "large"] as const,
      },
      align: {
        default: "center" as const,
        values: ["left", "center", "right"] as const,
      },
      // Sentinels keep older drafts on their original width and alignment.
      width_pct: { default: 0 },
      position_pct: { default: -1 },
      pair_share_pct: { default: 0 },
      layout: {
        default: "single" as const,
        values: ["single", "pair"] as const,
      },
    },
    content: "none",
  },
  {
    render: ({ block, editor }) => {
      return (
        <AssetImage
          blockId={block.id}
          assetId={block.props.asset_id}
          caption={block.props.caption}
          width={block.props.width}
          align={block.props.align}
          widthPct={block.props.width_pct}
          positionPct={block.props.position_pct}
          pairSharePct={block.props.pair_share_pct}
          layout={block.props.layout}
          getPairState={() => {
            const blocks = editor.document;
            const state = imagePairState(blocks, block.id);
            const partner = blocks[state.partnerIndex];
            const index = blocks.findIndex((item) => item.id === block.id);
            return {
              paired: state.partnerIndex >= 0,
              canPair: state.canPair,
              partnerId: partner?.id,
              partnerWidthPct:
                partner?.type === "image" ? partner.props.width_pct : 0,
              partnerSharePct:
                partner?.type === "image" ? partner.props.pair_share_pct : 0,
              side:
                state.partnerIndex < 0
                  ? undefined
                  : index < state.partnerIndex
                    ? ("first" as const)
                    : ("second" as const),
            };
          }}
          onCaptionChange={(caption) =>
            editor.updateBlock(block, { props: { caption } })
          }
          onLayoutChange={({ widthPct, positionPct }) =>
            editor.updateBlock(block, {
              props: { width_pct: widthPct, position_pct: positionPct },
            })
          }
          onPairShareChange={(sharePct) => {
            const blocks = editor.document;
            const { partnerIndex } = imagePairState(blocks, block.id);
            const partner = blocks[partnerIndex];
            if (partner?.type !== "image") return false;
            editor.updateBlock(block, { props: { pair_share_pct: sharePct } });
            editor.updateBlock(partner, {
              props: { pair_share_pct: Math.round((100 - sharePct) * 10) / 10 },
            });
            return true;
          }}
          onPairToggle={() => {
            const blocks = editor.document;
            const { partnerIndex, canPair, next } = imagePairState(
              blocks,
              block.id,
            );
            if (partnerIndex >= 0) {
              editor.updateBlock(block, { props: { layout: "single" } });
              editor.updateBlock(blocks[partnerIndex]!, {
                props: { layout: "single" },
              });
            } else if (
              blocks.find((item) => item.id === block.id)?.props.layout ===
              "pair"
            ) {
              editor.updateBlock(block, { props: { layout: "single" } });
            } else if (canPair) {
              editor.updateBlock(block, {
                props: { layout: "pair", pair_share_pct: 0 },
              });
              editor.updateBlock(next!, {
                props: { layout: "pair", pair_share_pct: 0 },
              });
            }
          }}
        />
      );
    },
  },
);
// Only text blocks supported by the existing travel-api renderer. Media requires asset IDs.
const schema = BlockNoteSchema.create({
  blockSpecs: {
    paragraph: defaultBlockSpecs.paragraph,
    heading: defaultBlockSpecs.heading,
    bulletListItem: defaultBlockSpecs.bulletListItem,
    numberedListItem: defaultBlockSpecs.numberedListItem,
    image: assetImage(),
    quote: defaultBlockSpecs.quote,
    codeBlock: defaultBlockSpecs.codeBlock,
  },
});
export type EditorDocument = PartialBlock<typeof schema.blockSchema>[];
export function WriterEditor({
  initialContent,
  editable = true,
  onChange,
  onReady,
  onUploadImage,
  renderImage,
  onError,
}: {
  initialContent?: EditorDocument;
  editable?: boolean;
  onChange?: (document: EditorDocument) => void;
  onReady?: (insertImage: (assetId: string, caption?: string) => void) => void;
  onUploadImage?: (file: File) => Promise<string>;
  renderImage?: (assetId: string) => ReactNode;
  onError?: (message: string) => void;
}) {
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(0);
  const [documentVersion, setDocumentVersion] = useState(0);
  const [pairDrafts, setPairDrafts] = useState<Record<string, number>>({});
  const setPairDraft = useCallback(
    (blockId: string, partnerId: string, sharePct: number | null) => {
      setPairDrafts((previous) => {
        const next = { ...previous };
        if (sharePct === null) {
          delete next[blockId];
          delete next[partnerId];
        } else {
          next[blockId] = sharePct;
          next[partnerId] = Math.round((100 - sharePct) * 10) / 10;
        }
        return next;
      });
    },
    [],
  );
  const editor = useCreateBlockNote({
    schema,
    dictionary: ko,
    // Empty drafts are stored as []; BlockNote requires at least one block.
    initialContent: initialContent?.length ? initialContent : undefined,
  });
  const [, setSelectionVersion] = useState(0);
  useEditorSelectionChange(
    () => setSelectionVersion((version) => version + 1),
    editor,
  );
  useEffect(() => {
    if (!editable) return;
    onReady?.((assetId, caption = "") => {
      const last = editor.document.at(-1);
      if (last)
        editor.insertBlocks(
          [{ type: "image", props: { asset_id: assetId, caption } }],
          last.id,
          "after",
        );
    });
  }, [editable, editor, onReady]);
  const handleDrop = useCallback(
    async (event: DragEvent<HTMLDivElement>) => {
      const files = Array.from(event.dataTransfer.files);
      if (!files.length) return;
      event.preventDefault();
      event.stopPropagation();
      setDragging(false);
      const images = files.filter(
        (file) =>
          ACCEPTED_IMAGE_TYPES.has(file.type) &&
          file.size > 0 &&
          file.size <= MAX_IMAGE_SIZE,
      );
      if (!images.length) {
        onError?.(
          "이미지는 JPG, PNG, WebP 형식의 20MB 이하 파일만 넣을 수 있습니다.",
        );
        return;
      }
      if (images.length !== files.length)
        onError?.("지원하지 않는 파일은 건너뛰고 이미지만 넣습니다.");
      if (!onUploadImage) {
        onError?.("이미지 업로드 설정을 사용할 수 없습니다.");
        return;
      }
      const target =
        event.target instanceof Element
          ? event.target.closest<HTMLElement>("[data-id]")
          : null;
      const targetId = target?.dataset.id;
      const fallback = editor.getTextCursorPosition().block.id;
      let insertionPoint =
        targetId && editor.getBlock(targetId) ? targetId : fallback;
      setUploading((count) => count + images.length);
      onError?.("");
      try {
        for (const file of images) {
          const assetId = await onUploadImage(file);
          const inserted = editor.insertBlocks(
            [{ type: "image", props: { asset_id: assetId, caption: "" } }],
            insertionPoint,
            "after",
          );
          insertionPoint = inserted.at(-1)?.id ?? insertionPoint;
        }
      } catch (error) {
        onError?.(
          error instanceof Error
            ? error.message
            : "이미지를 업로드하지 못했습니다.",
        );
      } finally {
        setUploading((count) => Math.max(0, count - images.length));
      }
    },
    [editor, onError, onUploadImage],
  );

  const formattingToolbar = useCallback(
    () => <FormattingToolbar>{getFormattingToolbarItems()}</FormattingToolbar>,
    [],
  );
  const imageRenderer = useCallback(
    (assetId: string) => renderImage?.(assetId),
    [renderImage],
  );
  const currentBlock = editor.getTextCursorPosition().block;
  const currentBlockStyle =
    currentBlock.type === "heading"
      ? `heading${currentBlock.props.level}`
      : currentBlock.type;
  const blockStyleOptions = [
    ["paragraph", "본문"],
    ["heading1", "제목 1"],
    ["heading2", "제목 2"],
    ["heading3", "제목 3"],
    ["bulletListItem", "글머리 목록"],
    ["numberedListItem", "번호 목록"],
    ["quote", "인용"],
    ["codeBlock", "코드"],
  ] as const;

  return (
    <ImagePreviewContext.Provider
      value={{
        renderPreview: imageRenderer,
        editable,
        documentVersion,
        pairDrafts,
        setPairDraft,
      }}
    >
      <div
        className="writer-editor space-y-2"
        onDragEnter={(event) => {
          if (!editable) return;
          if (event.dataTransfer.types.includes("Files")) {
            event.preventDefault();
            setDragging(true);
          }
        }}
        onDragOver={(event) => {
          if (!editable) return;
          if (event.dataTransfer.types.includes("Files"))
            event.preventDefault();
        }}
        onDragLeave={(event) => {
          if (!editable) return;
          if (
            event.currentTarget === event.target ||
            !event.currentTarget.contains(event.relatedTarget as Node | null)
          )
            setDragging(false);
        }}
        onDropCapture={editable ? (event) => void handleDrop(event) : undefined}
      >
        {editable && (
          <div
            className="flex flex-wrap items-center gap-2 rounded-md border bg-stone-50 p-2"
            role="toolbar"
            aria-label="본문 서식"
          >
            <div
              className="flex flex-wrap items-center gap-1"
              role="group"
              aria-label="문단과 블록 스타일"
            >
              {blockStyleOptions.map(([style, label]) => {
                const selected = currentBlockStyle === style;
                return (
                  <button
                    key={style}
                    type="button"
                    className={`h-9 w-9 rounded border p-2 text-stone-700 transition-colors ${selected ? "bg-emerald-100" : "bg-white hover:bg-stone-100"}`}
                    aria-label={label}
                    aria-pressed={selected}
                    title={label}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => {
                      const current = editor.getTextCursorPosition().block;
                      if (style === "paragraph")
                        editor.updateBlock(current, { type: "paragraph" });
                      else if (
                        style === "heading1" ||
                        style === "heading2" ||
                        style === "heading3"
                      )
                        editor.updateBlock(current, {
                          type: "heading",
                          props: {
                            level: Number(style.slice(-1)) as 1 | 2 | 3,
                          },
                        });
                      else editor.updateBlock(current, { type: style });
                    }}
                  >
                    <svg
                      aria-hidden="true"
                      viewBox="0 0 24 24"
                      fill="currentColor"
                      className="h-5 w-5"
                    >
                      {blockStyleIcons[style]}
                    </svg>
                  </button>
                );
              })}
            </div>
            {(
              [
                ["bold", "굵게"],
                ["italic", "기울임"],
                ["underline", "밑줄"],
                ["strike", "취소선"],
              ] as const
            ).map(([style, label]) => (
              <button
                key={style}
                type="button"
                className={`h-9 w-10 rounded border p-2 text-stone-700 transition-colors ${editor.getActiveStyles()[style] ? "bg-emerald-100" : "bg-white hover:bg-stone-100"}`}
                aria-label={label}
                aria-pressed={Boolean(editor.getActiveStyles()[style])}
                title={label}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => editor.toggleStyles({ [style]: true })}
              >
                <svg
                  aria-hidden="true"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  className="h-5 w-5"
                >
                  {inlineStyleIcons[style]}
                </svg>
              </button>
            ))}
            {uploading > 0 && (
              <span role="status" className="text-muted-foreground text-sm">
                이미지 업로드 중… ({uploading})
              </span>
            )}
            {dragging && (
              <span className="text-sm font-medium text-emerald-800">
                여기에 놓아 본문에 추가
              </span>
            )}
          </div>
        )}
        <div
          className={
            dragging
              ? "rounded-md outline-2 outline-offset-2 outline-emerald-600 outline-dashed"
              : ""
          }
        >
          <BlockNoteView
            editor={editor}
            editable={editable}
            theme="light"
            onChange={() => {
              setDocumentVersion((version) => version + 1);
              onChange?.(editor.document);
            }}
            formattingToolbar={false}
          >
            {editable && (
              <FormattingToolbarController
                formattingToolbar={formattingToolbar}
              />
            )}
          </BlockNoteView>
        </div>
      </div>
    </ImagePreviewContext.Provider>
  );
}
