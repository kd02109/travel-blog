import { fileURLToPath } from "node:url";

const nextConfig = {
  distDir: process.env.TRAVEL_NEXT_DIST_DIR || ".next",
  async headers() {
    return process.env.VERCEL_ENV
      ? [
          {
            source: "/:path*",
            headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }],
          },
        ]
      : [];
  },
  outputFileTracingRoot: fileURLToPath(new URL("../../", import.meta.url)),
  outputFileTracingIncludes: {
    "/api/internal/media-worker": [
      "node_modules/pdfjs-dist/standard_fonts/**/*",
      "../../packages/media-worker/node_modules/pdfjs-dist/standard_fonts/**/*",
      "node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs",
      "../../packages/media-worker/node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs",
    ],
  },
  // PDF.js loads its Node worker relative to its own module. Bundling it into
  // Next chunks breaks that path. This only affects the server; the browser
  // reader still bundles its own worker URL.
  serverExternalPackages: ["@napi-rs/canvas", "pdfjs-dist"],
  // Maps are generated only for a local isolated archive build. Vercel builds
  // never emit browser source maps until a durable private uploader exists.
  productionBrowserSourceMaps:
    process.env.TRAVEL_PRIVATE_SOURCE_MAP_BUILD === "1" &&
    /^\.next-test-private-maps-[a-zA-Z0-9]+$/.test(
      process.env.TRAVEL_NEXT_DIST_DIR || "",
    ) &&
    !process.env.VERCEL,
  transpilePackages: [
    "@repo/ui",
    "@repo/editor",
    "@repo/database",
    "@repo/api-client",
    "@repo/constants",
    "@repo/observability",
    "@repo/analytics",
    "@repo/pdf-reader",
    "@repo/media-worker",
  ],
};
export default nextConfig;
