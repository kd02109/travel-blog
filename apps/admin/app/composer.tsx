"use client";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { EditorDocument } from "@repo/editor";
import { Button } from "@repo/ui/button";
import { createBrowserTravelApi } from "@repo/api-client/browser";
import { MediaUpload } from "./media-upload";
import { PrivateAssetView } from "./asset-view";
const Editor = dynamic(
  () => import("@repo/editor").then((module) => module.WriterEditor),
  { ssr: false, loading: () => <p>편집기를 준비하고 있어요…</p> },
);
export function Composer() {
  const api = useMemo(() => createBrowserTravelApi(), []);
  const [siteId, setSiteId] = useState("");
  const [insertImage, setInsertImage] =
    useState<(assetId: string, caption?: string) => void>();
  const [coverAssetId, setCoverAssetId] = useState("");
  const [pdfAssetId, setPdfAssetId] = useState("");
  const [document, setDocument] = useState<EditorDocument>([
    { type: "paragraph", content: "여행의 첫 장면을 적어 보세요." },
  ]);
  const [preview, setPreview] = useState(false);
  useEffect(() => {
    void api
      .getSite()
      .then((site) => setSiteId(site.id))
      .catch(() => undefined);
  }, [api]);
  const onEditorReady = useCallback(
    (insert: (assetId: string, caption?: string) => void) =>
      setInsertImage(() => insert),
    [],
  );
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
          onReady={onEditorReady}
        />
      </section>
      {siteId ? (
        <MediaUpload
          siteId={siteId}
          onInsertImage={insertImage}
          onSetCoverImage={setCoverAssetId}
          onSelectPdf={setPdfAssetId}
        />
      ) : (
        <p role="status">파일 저장소를 연결하고 있어요…</p>
      )}
      {siteId && coverAssetId && (
        <section
          className="space-y-2 rounded-lg border p-4"
          aria-label="대표 사진 미리보기"
        >
          <h2 className="font-medium">선택한 대표 사진</h2>
          <PrivateAssetView
            assetId={coverAssetId}
            siteId={siteId}
            kind="image"
            title="대표 사진"
          />
        </section>
      )}
      {siteId && pdfAssetId && (
        <section
          className="space-y-2 rounded-lg border p-4"
          aria-label="선택한 일정 PDF"
        >
          <h2 className="font-medium">선택한 일정 PDF</h2>
          <PrivateAssetView
            assetId={pdfAssetId}
            siteId={siteId}
            kind="pdf"
            title="일정 PDF"
          />
        </section>
      )}
    </main>
  );
}
