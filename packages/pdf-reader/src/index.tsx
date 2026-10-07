"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createBrowserTravelApi } from "@repo/api-client/browser";
import { Document, Page, pdfjs } from "react-pdf";
import type { PDFDocumentProxy } from "pdfjs-dist";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";
import styles from "./pdf-reader.module.css";

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url,
).toString();

// Load the document while its signed URL is valid. Later page and zoom changes
// then use the already loaded PDF instead of issuing requests against an expired URL.
const documentOptions = { disableRange: true, disableStream: true };

type PdfAsset = {
  url: string;
  metadata: Record<string, unknown>;
};

function PageSkeleton() {
  return (
    <div className={styles.stateLayer} role="status">
      <span className={styles.srOnly}>PDF 문서를 불러오는 중입니다.</span>
      <div className={styles.skeletonPage} aria-hidden="true">
        <span className={styles.skeletonEyebrow} />
        <span className={styles.skeletonTitle} />
        <span className={styles.skeletonLine} />
        <span className={styles.skeletonLineShort} />
        <span className={styles.skeletonGap} />
        <span className={styles.skeletonLine} />
        <span className={styles.skeletonLine} />
        <span className={styles.skeletonLineShort} />
        <span className={styles.skeletonGap} />
        <span className={styles.skeletonLine} />
        <span className={styles.skeletonLineShort} />
      </div>
    </div>
  );
}

function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <div className={styles.stateLayer} role="alert">
      <div className={styles.errorContent}>
        <span className={styles.errorMark} aria-hidden="true">
          !
        </span>
        <strong>문서를 열지 못했어요</strong>
        <p>연결 상태를 확인한 뒤 다시 시도해 주세요.</p>
        <button className={styles.retryButton} onClick={onRetry} type="button">
          다시 시도
        </button>
      </div>
    </div>
  );
}

export default function PdfReader({
  assetId,
  siteId,
  title,
}: {
  assetId: string;
  siteId: string;
  title: string;
}) {
  const api = useMemo(() => createBrowserTravelApi(), []);
  const stageRef = useRef<HTMLDivElement>(null);
  const [asset, setAsset] = useState<PdfAsset | null>(null);
  const [accessError, setAccessError] = useState(false);
  const [renderError, setRenderError] = useState(false);
  const [requestKey, setRequestKey] = useState(0);
  const [pageCount, setPageCount] = useState<number | null>(null);
  const [pdfDocument, setPdfDocument] = useState<PDFDocumentProxy | null>(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [zoom, setZoom] = useState(100);
  const [pageReady, setPageReady] = useState(false);
  const [baseWidth, setBaseWidth] = useState(480);
  const [downloading, setDownloading] = useState(false);
  const [actionError, setActionError] = useState("");

  useEffect(() => {
    let active = true;
    const load = async () => {
      setAsset(null);
      setAccessError(false);
      setRenderError(false);
      setPageReady(false);
      setPdfDocument(null);
      try {
        const next = await api.call("asset.access", {
          id: assetId,
          site_id: siteId,
        });
        if (!active) return;
        setAsset({ url: next.url, metadata: next.metadata });
        const knownPages = Number(next.metadata.page_count);
        setPageCount(
          Number.isSafeInteger(knownPages) && knownPages > 0
            ? knownPages
            : null,
        );
      } catch {
        if (active) setAccessError(true);
      }
    };
    void load();
    return () => {
      active = false;
    };
  }, [api, assetId, siteId, requestKey]);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const resize = () => {
      setBaseWidth(Math.max(240, Math.min(620, stage.clientWidth - 56)));
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(stage);
    return () => observer.disconnect();
  }, []);

  const retry = () => setRequestKey((current) => current + 1);
  const updatePage = (next: number) => {
    if (!pageCount || next < 1 || next > pageCount) return;
    setPageReady(false);
    setPageNumber(next);
    stageRef.current?.scrollTo({ top: 0, left: 0 });
  };
  const updateZoom = (next: number) => {
    if (next < 75 || next > 200) return;
    setPageReady(false);
    setZoom(next);
  };

  const openOriginal = async () => {
    // Reserve the tab within the click event so popup blockers do not turn the
    // signed-URL lookup into a failed navigation after the user has clicked.
    const tab = window.open("about:blank", "_blank");
    if (tab) tab.opener = null;
    setActionError("");
    try {
      const fresh = await api.call("asset.access", {
        id: assetId,
        site_id: siteId,
      });
      if (tab) tab.location.replace(fresh.url);
      else window.location.assign(fresh.url);
    } catch {
      tab?.close();
      setActionError("원본을 열지 못했어요. 잠시 후 다시 시도해 주세요.");
    }
  };

  const download = async () => {
    setDownloading(true);
    setActionError("");
    try {
      const fresh = await api.call("asset.access", {
        id: assetId,
        site_id: siteId,
      });
      const response = await fetch(fresh.url);
      if (!response.ok) throw new Error("download_failed");
      const objectUrl = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = `${title.replace(/\.pdf$/i, "").replace(/[\\/:*?"<>|]/g, "-")}.pdf`;
      document.body.append(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
    } catch {
      setActionError(
        "파일을 저장하지 못했어요. 원본을 열어 브라우저에서 저장해 주세요.",
      );
    } finally {
      setDownloading(false);
    }
  };

  const failed = accessError || renderError;
  const filename = title.toLowerCase().endsWith(".pdf")
    ? title
    : `${title}.pdf`;

  return (
    <section className={styles.reader} aria-label={`${title} PDF 일정표`}>
      <div className={styles.header}>
        <div className={styles.heading}>
          <strong title={filename}>{filename}</strong>
          <span>
            여행 기록에 첨부된 문서
            {pageCount ? ` · ${pageCount}쪽` : ""}
          </span>
        </div>
        <div className={styles.actions}>
          <button onClick={() => void openOriginal()} type="button">
            원본 열기 <span aria-hidden="true">↗</span>
          </button>
          <button
            aria-label="PDF 파일 저장"
            disabled={downloading}
            onClick={() => void download()}
            type="button"
          >
            {downloading ? "저장 중…" : "파일 저장 ↓"}
          </button>
        </div>
      </div>
      {actionError && (
        <p className={styles.actionError} role="alert">
          {actionError}
        </p>
      )}
      <div className={styles.main}>
        <aside className={styles.sidebar} aria-label="문서 미리보기">
          <span className={styles.sidebarLabel}>문서 미리보기</span>
          <button
            aria-label="첫 페이지로 이동"
            className={styles.thumbnail}
            disabled={!pdfDocument || failed}
            onClick={() => updatePage(1)}
            type="button"
          >
            {pdfDocument ? (
              <Page
                error={null}
                loading={null}
                pageNumber={1}
                pdf={pdfDocument}
                renderAnnotationLayer={false}
                renderTextLayer={false}
                suspense={false}
                width={94}
              />
            ) : (
              <span className={styles.thumbnailSkeleton} aria-hidden="true" />
            )}
          </button>
          <span className={styles.thumbnailCaption}>
            1 / {pageCount ?? "—"}
          </span>
        </aside>
        <div className={styles.stage}>
          <div className={styles.toolbar}>
            <div className={styles.controlGroup} aria-label="페이지 이동">
              <button
                aria-label="이전 페이지"
                disabled={!asset || !pageCount || pageNumber <= 1 || failed}
                onClick={() => updatePage(pageNumber - 1)}
                type="button"
              >
                ‹
              </button>
              <span className={styles.pageCount} aria-live="polite">
                {pageNumber} / {pageCount ?? "—"}
              </span>
              <button
                aria-label="다음 페이지"
                disabled={
                  !asset || !pageCount || pageNumber >= pageCount || failed
                }
                onClick={() => updatePage(pageNumber + 1)}
                type="button"
              >
                ›
              </button>
            </div>
            <div className={styles.controlGroup} aria-label="문서 배율">
              <button
                aria-label="축소"
                disabled={!asset || zoom <= 75 || failed}
                onClick={() => updateZoom(zoom - 25)}
                type="button"
              >
                −
              </button>
              <span className={styles.zoomLabel} aria-live="polite">
                {zoom}%
              </span>
              <button
                aria-label="확대"
                disabled={!asset || zoom >= 200 || failed}
                onClick={() => updateZoom(zoom + 25)}
                type="button"
              >
                +
              </button>
            </div>
          </div>
          <div className={styles.canvasArea} ref={stageRef}>
            {asset && !failed && (
              <Document
                error={null}
                file={asset.url}
                key={asset.url}
                loading={null}
                onLoadError={() => setRenderError(true)}
                onLoadSuccess={(loaded) => {
                  const { numPages } = loaded;
                  setPdfDocument(loaded);
                  setPageCount(numPages);
                  setPageNumber((current) => Math.min(current, numPages));
                }}
                options={documentOptions}
                suspense={false}
              >
                <Page
                  className={styles.pdfPage}
                  error={null}
                  loading={null}
                  onLoadError={() => setRenderError(true)}
                  onRenderError={() => setRenderError(true)}
                  onRenderSuccess={() => setPageReady(true)}
                  pageNumber={pageNumber}
                  suspense={false}
                  width={Math.round((baseWidth * zoom) / 100)}
                />
              </Document>
            )}
            {failed ? (
              <ErrorState onRetry={retry} />
            ) : (
              !pageReady && <PageSkeleton />
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
