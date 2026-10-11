const nextConfig = {
  distDir: process.env.TRAVEL_NEXT_DIST_DIR || ".next",
  async headers() {
    return process.env.VERCEL_ENV === "preview"
      ? [
          {
            source: "/:path*",
            headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }],
          },
        ]
      : [];
  },
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
  ],
};
export default nextConfig;
