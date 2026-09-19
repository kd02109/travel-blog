"use client";
import dynamic from "next/dynamic";
import { useState } from "react";
import type { EditorDocument } from "@repo/editor";
import { Button } from "@repo/ui/button";
const Editor = dynamic(
  () => import("@repo/editor").then((module) => module.WriterEditor),
  { ssr: false, loading: () => <p>편집기를 준비하고 있어요…</p> },
);
export function Composer() {
  const [document, setDocument] = useState<EditorDocument>([
    { type: "paragraph", content: "여행의 첫 장면을 적어 보세요." },
  ]);
  const [preview, setPreview] = useState(false);
  return (
    <main className="mx-auto max-w-4xl px-6 py-12">
      <header className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-3xl font-semibold">여행기 쓰기</h1>
        <Button variant="outline" onClick={() => setPreview(!preview)}>
          {preview ? "이어서 쓰기" : "미리보기"}
        </Button>
      </header>
      <p className="text-muted-foreground mb-8">
        작성 내용은 이 화면에서만 유지됩니다. 새로고침하면 사라집니다.
      </p>
      <section
        aria-label={preview ? "본문 미리보기" : "본문 편집기"}
        className="min-h-96 rounded-lg border bg-white py-8"
      >
        <Editor
          key={preview ? "preview" : "edit"}
          initialContent={document}
          editable={!preview}
          onChange={setDocument}
        />
      </section>
    </main>
  );
}
