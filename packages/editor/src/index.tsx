"use client";
import {
  BlockNoteSchema,
  defaultBlockSpecs,
  type PartialBlock,
} from "@blocknote/core";
import { ko } from "@blocknote/core/locales";
import { useCreateBlockNote } from "@blocknote/react";
import { BlockNoteView } from "@blocknote/shadcn";
// Only text blocks supported by the existing travel-api renderer. Media requires asset IDs.
const schema = BlockNoteSchema.create({
  blockSpecs: {
    paragraph: defaultBlockSpecs.paragraph,
    heading: defaultBlockSpecs.heading,
    bulletListItem: defaultBlockSpecs.bulletListItem,
    numberedListItem: defaultBlockSpecs.numberedListItem,
    quote: defaultBlockSpecs.quote,
    codeBlock: defaultBlockSpecs.codeBlock,
  },
});
export type EditorDocument = PartialBlock<typeof schema.blockSchema>[];
export function WriterEditor({
  initialContent,
  editable = true,
  onChange,
}: {
  initialContent?: EditorDocument;
  editable?: boolean;
  onChange?: (document: EditorDocument) => void;
}) {
  const editor = useCreateBlockNote({ schema, dictionary: ko, initialContent });
  return (
    <BlockNoteView
      editor={editor}
      editable={editable}
      theme="light"
      onChange={() => onChange?.(editor.document)}
    />
  );
}
