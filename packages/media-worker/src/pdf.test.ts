import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { processPdf } from "./pdf.ts";

const fixture = new URL(
  "../../../apps/web/public/mock-assets/itinerary.pdf",
  import.meta.url,
);

describe("PDF processing", () => {
  it("preserves the original PDF for upload and creates a first-page preview", async () => {
    const original = new Uint8Array(readFileSync(fixture));
    const source = original.slice();

    const result = await processPdf(source);

    expect(source).toEqual(original);
    expect(result.metadata).toMatchObject({
      mime: "application/pdf",
      bytes: original.byteLength,
      checksum: createHash("sha256").update(original).digest("hex"),
      page_count: 1,
    });
    expect(result.preview.byteLength).toBeGreaterThan(0);
    expect(result.preview.subarray(0, 8)).toEqual(
      new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
    );
    expect(result.previewMetadata).toMatchObject({
      mime: "image/png",
      bytes: result.preview.byteLength,
    });
  });

  it("loads packaged standard fonts without a PDF.js warning", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    try {
      await processPdf(new Uint8Array(readFileSync(fixture)));
      expect(log.mock.calls.flat().join(" ")).not.toContain(
        "standardFontDataUrl",
      );
    } finally {
      log.mockRestore();
    }
  });
});
