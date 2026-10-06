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
  useState,
} from "react";
import type { ReactNode, DragEvent } from "react";
import {
  FormattingToolbar,
  FormattingToolbarController,
  getFormattingToolbarItems,
} from "@blocknote/react";
import { imagePairState } from "./image-layout";

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
    }
  | undefined
>(undefined);

function AssetImage({
  assetId,
  caption,
  width,
  align,
  layout,
  onCaptionChange,
  onWidthChange,
  onAlignChange,
  onPairToggle,
  getPairState,
}: {
  assetId: string;
  caption: string;
  width: "small" | "medium" | "large";
  align: "left" | "center" | "right";
  layout: "single" | "pair";
  onCaptionChange: (caption: string) => void;
  onWidthChange: (width: "small" | "medium" | "large") => void;
  onAlignChange: (align: "left" | "center" | "right") => void;
  onPairToggle: () => void;
  getPairState: () => { canPair: boolean; paired: boolean };
}) {
  const { renderPreview, editable = true } =
    useContext(ImagePreviewContext) ?? {};
  const { canPair, paired } = getPairState();
  const hasPairSetting = paired || layout === "pair";
  const widths = [
    ["small", "작게"],
    ["medium", "보통"],
    ["large", "넓게"],
  ] as const;
  const alignments = [
    ["left", "왼쪽"],
    ["center", "가운데"],
    ["right", "오른쪽"],
  ] as const;
  return (
    <figure
      className="writer-image"
      data-image-width={width}
      data-image-align={align}
      data-image-layout={paired ? "pair" : "single"}
    >
      {editable && (
        <div className="writer-image-toolbar" aria-label="사진 배치 설정">
          <div
            className="writer-image-toolbar-group"
            role="group"
            aria-label="사진 크기"
          >
            <span>크기</span>
            {widths.map(([value, label]) => (
              <button
                key={value}
                type="button"
                aria-label={`사진 크기 ${label}`}
                aria-pressed={width === value}
                onMouseDown={(event) => event.preventDefault()}
                onClick={(event) => {
                  event.stopPropagation();
                  onWidthChange(value);
                }}
              >
                {label}
              </button>
            ))}
          </div>
          <div
            className="writer-image-toolbar-group"
            role="group"
            aria-label="사진 정렬"
          >
            <span>정렬</span>
            {alignments.map(([value, label]) => (
              <button
                key={value}
                type="button"
                aria-label={`사진 정렬 ${label}`}
                aria-pressed={align === value}
                onMouseDown={(event) => event.preventDefault()}
                onClick={(event) => {
                  event.stopPropagation();
                  onAlignChange(value);
                }}
              >
                {label}
              </button>
            ))}
          </div>
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
      <div className="writer-image-media">
        {renderPreview?.(assetId) ?? (
          <p className="text-muted-foreground text-sm">사진을 불러오는 중…</p>
        )}
      </div>
      <figcaption>
        {editable ? (
          <label>
            <span>사진 설명</span>
            <input
              aria-label="사진 설명"
              placeholder="사진 설명을 적어 주세요"
              value={caption}
              onChange={(event) => onCaptionChange(event.currentTarget.value)}
              onKeyDown={(event) => event.stopPropagation()}
            />
          </label>
        ) : caption ? (
          caption
        ) : null}
      </figcaption>
    </figure>
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
          assetId={block.props.asset_id}
          caption={block.props.caption}
          width={block.props.width}
          align={block.props.align}
          layout={block.props.layout}
          getPairState={() => {
            const state = imagePairState(editor.document, block.id);
            return {
              paired: state.partnerIndex >= 0,
              canPair: state.canPair,
            };
          }}
          onCaptionChange={(caption) =>
            editor.updateBlock(block, { props: { caption } })
          }
          onWidthChange={(width) =>
            editor.updateBlock(block, { props: { width } })
          }
          onAlignChange={(align) =>
            editor.updateBlock(block, { props: { align } })
          }
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
              editor.updateBlock(block, { props: { layout: "pair" } });
              editor.updateBlock(next!, { props: { layout: "pair" } });
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
      value={{ renderPreview: imageRenderer, editable, documentVersion }}
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
