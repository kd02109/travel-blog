import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  if (process.env.VERCEL_ENV === "preview") {
    return { rules: [{ userAgent: "*", disallow: "/" }] };
  }
  const origin = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  return {
    rules: [
      { userAgent: "*", allow: "/", disallow: ["/api/", "/auth/", "/login"] },
    ],
    sitemap: new URL("/sitemap.xml", origin).toString(),
  };
}
