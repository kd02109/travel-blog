import { fileURLToPath } from "node:url";

const nextConfig = {
  distDir: process.env.TRAVEL_NEXT_DIST_DIR || ".next",
  outputFileTracingRoot: fileURLToPath(new URL("../../", import.meta.url)),
  outputFileTracingIncludes: {
    "/api/internal/media-worker": [
      "node_modules/pdfjs-dist/standard_fonts/**/*",
      "../../packages/media-worker/node_modules/pdfjs-dist/standard_fonts/**/*",
    ],
  },
  // Keep native Canvas on Node's resolver; bundling its platform binary makes
  // webpack parse a .node file. PDF.js stays bundled because the client reader
  // references its ESM worker through new URL(..., import.meta.url).
  serverExternalPackages: ["@napi-rs/canvas"],
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
