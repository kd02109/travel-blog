import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { BlockNoteEditor } from "@blocknote/core";
import { afterEach, expect, test, vi } from "vitest";

// Exercise the real BlockNote document constructor without mounting its DOM UI.
vi.mock("@blocknote/react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@blocknote/react")>();
  return {
    ...actual,
    useCreateBlockNote: vi.fn((options) => BlockNoteEditor.create(options)),
  };
});
vi.mock("@blocknote/shadcn", () => ({ BlockNoteView: () => null }));

import { useCreateBlockNote } from "@blocknote/react";
import { WriterEditor, type EditorDocument } from "./index";

afterEach(() => vi.clearAllMocks());

test("opens an empty saved draft with a blank paragraph", () => {
  expect(() =>
    renderToStaticMarkup(createElement(WriterEditor, { initialContent: [] })),
  ).not.toThrow();
  const editor = vi.mocked(useCreateBlockNote).mock.results[0]!.value;
  expect(editor.document).toMatchObject([{ type: "paragraph", content: [] }]);
});

test("preserves text and asset references in an existing draft", () => {
  const initialContent: EditorDocument = [
    { type: "paragraph", content: "제주 여행 기록" },
    { type: "image", props: { asset_id: "saved-asset", caption: "바다" } },
  ];
  renderToStaticMarkup(createElement(WriterEditor, { initialContent }));
  const editor = vi.mocked(useCreateBlockNote).mock.results[0]!.value;
  expect(editor.document).toMatchObject([
    { type: "paragraph", content: [{ type: "text", text: "제주 여행 기록" }] },
    {
      type: "image",
      props: {
        asset_id: "saved-asset",
        caption: "바다",
        width: "large",
        align: "center",
        layout: "single",
      },
    },
  ]);
});

test("restores each image's size, alignment, and paired layout from a saved draft", () => {
  const initialContent: EditorDocument = [
    {
      type: "image",
      props: {
        asset_id: "left-asset",
        caption: "첫 사진",
        width: "medium",
        align: "left",
        layout: "pair",
      },
    },
    {
      type: "image",
      props: {
        asset_id: "right-asset",
        caption: "두 번째 사진",
        width: "small",
        align: "right",
        layout: "pair",
      },
    },
  ];
  renderToStaticMarkup(createElement(WriterEditor, { initialContent }));
  const editor = vi.mocked(useCreateBlockNote).mock.results[0]!.value;
  expect(editor.document).toMatchObject([
    { type: "image", props: initialContent[0]!.props },
    { type: "image", props: initialContent[1]!.props },
  ]);
});
