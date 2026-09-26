"use client";
import {
  BlockNoteSchema,
  defaultBlockSpecs,
  type PartialBlock,
} from "@blocknote/core";
import { ko } from "@blocknote/core/locales";
import { useCreateBlockNote } from "@blocknote/react";
import { BlockNoteView } from "@blocknote/shadcn";
import { createReactBlockSpec } from "@blocknote/react";
import { useEffect } from "react";
const assetImage = createReactBlockSpec(
  {
    type: "image",
    propSchema: {
      asset_id: { default: "" },
      caption: { default: "" },
    },
    content: "none",
  },
  {
    render: ({ block, editor }) => (
      <figure className="mx-auto my-4 max-w-xl rounded-md border bg-stone-50 p-4">
        <p className="text-muted-foreground text-sm">
          사진 자산 {block.props.asset_id || "연결되지 않음"}
        </p>
        <input
          className="mt-2 w-full rounded border bg-white px-3 py-2"
          aria-label="사진 설명"
          placeholder="사진 설명을 적어 주세요"
          value={block.props.caption}
          onChange={(event) =>
            editor.updateBlock(block, {
              props: { caption: event.currentTarget.value },
            })
          }
          onKeyDown={(event) => event.stopPropagation()}
        />
      </figure>
    ),
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
}: {
  initialContent?: EditorDocument;
  editable?: boolean;
  onChange?: (document: EditorDocument) => void;
  onReady?: (insertImage: (assetId: string, caption?: string) => void) => void;
}) {
  const editor = useCreateBlockNote({ schema, dictionary: ko, initialContent });
  useEffect(() => {
    onReady?.((assetId, caption = "") => {
      const last = editor.document.at(-1);
      if (last)
        editor.insertBlocks(
          [{ type: "image", props: { asset_id: assetId, caption } }],
          last.id,
          "after",
        );
    });
  }, [editor, onReady]);
  return (
    <BlockNoteView
      editor={editor}
      editable={editable}
      theme="light"
      onChange={() => onChange?.(editor.document)}
    />
  );
}
