import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { createCanvas } from "@napi-rs/canvas";
import {
  getDocument,
  GlobalWorkerOptions,
} from "pdfjs-dist/legacy/build/pdf.mjs";

const MAX_PAGES = 200;
// The deployed Next.js chunk no longer has this source file's import.meta URL.
// Both app and package font directories are included in the route file trace.
const standardFontDataUrl = [
  join(process.cwd(), "node_modules/pdfjs-dist/standard_fonts"),
  join(process.cwd(), "apps/admin/node_modules/pdfjs-dist/standard_fonts"),
  join(
    process.cwd(),
    "packages/media-worker/node_modules/pdfjs-dist/standard_fonts",
  ),
].find((directory) => existsSync(join(directory, "FoxitSerif.pfb")));
if (!standardFontDataUrl) throw new Error("missing_pdf_standard_fonts");
// A deployment may trace PDF.js itself under pnpm's canonical path but copy
// explicit includes under an app/package alias. Resolve the included worker
// explicitly instead of relying on PDF.js's relative dynamic import.
const workerPath = [
  join(process.cwd(), "node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs"),
  join(
    process.cwd(),
    "apps/admin/node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs",
  ),
  join(
    process.cwd(),
    "packages/media-worker/node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs",
  ),
].find(existsSync);
if (!workerPath) throw new Error("missing_pdf_worker");
GlobalWorkerOptions.workerSrc = pathToFileURL(workerPath).href;

function digest(bytes: Uint8Array) {
  return createHash("sha256").update(bytes).digest("hex");
}

export async function processPdf(source: Uint8Array) {
  if (new TextDecoder().decode(source.subarray(0, 5)) !== "%PDF-")
    throw new Error("invalid_pdf");
  const document = await getDocument({
    // PDF.js transfers its input buffer; keep the source available for upload.
    data: source.slice(),
    stopAtErrors: true,
    isEvalSupported: false,
    standardFontDataUrl: `${standardFontDataUrl}/`,
  }).promise.catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "";
    throw new Error(
      /fake worker|pdf\.worker/i.test(message)
        ? "pdf_worker_unavailable"
        : "pdf_parse_failed",
    );
  });
  try {
    if (document.numPages < 1 || document.numPages > MAX_PAGES)
      throw new Error("invalid_page_count");
    const page = await document.getPage(1);
    const baseViewport = page.getViewport({ scale: 1 });
    if (
      !Number.isFinite(baseViewport.width) ||
      !Number.isFinite(baseViewport.height) ||
      baseViewport.width <= 0 ||
      baseViewport.height <= 0
    )
      throw new Error("invalid_page_size");
    const scale = Math.min(
      1200 / baseViewport.width,
      1600 / baseViewport.height,
    );
    const viewport = page.getViewport({ scale });
    const canvas = createCanvas(
      Math.ceil(viewport.width),
      Math.ceil(viewport.height),
    );
    const context = canvas.getContext("2d");
    await page
      .render({
        canvas: canvas as unknown as HTMLCanvasElement,
        canvasContext: context as never,
        viewport,
      })
      .promise.catch(() => {
        throw new Error("pdf_render_failed");
      });
    const preview = new Uint8Array(await canvas.encode("png"));
    page.cleanup();
    return {
      preview,
      pages: document.numPages,
      metadata: {
        mime: "application/pdf",
        bytes: source.length,
        checksum: digest(source),
        page_count: document.numPages,
      },
      previewMetadata: {
        mime: "image/png",
        bytes: preview.length,
        checksum: digest(preview),
        width: canvas.width,
        height: canvas.height,
      },
    };
  } finally {
    await document.destroy();
  }
}
