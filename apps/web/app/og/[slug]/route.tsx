import { createServerTravelApi } from "@repo/api-client/server";
import { TravelApiError } from "@repo/api-client";
import { CATEGORIES } from "@repo/constants";
import { ImageResponse } from "next/og";

export const dynamic = "force-dynamic";

function titleCard(
  title: string,
  category: string,
  slug: string,
  siteName: string,
) {
  const displayTitle = title.length > 42 ? `${title.slice(0, 41)}…` : title;
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        backgroundColor: "#f5f4ee",
        color: "#193b42",
        padding: "64px 76px",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          fontSize: 24,
          letterSpacing: 2,
        }}
      >
        <span>TRAVEL JOURNAL</span>
        <span>{category}</span>
      </div>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 20,
          maxWidth: 1040,
        }}
      >
        <div
          style={{
            fontSize: title.length > 28 ? 52 : 66,
            fontWeight: 700,
            lineHeight: 1.3,
          }}
        >
          {displayTitle}
        </div>
        <div style={{ color: "#65777b", fontSize: 24 }}>{slug}</div>
      </div>
      <div
        style={{ display: "flex", alignItems: "center", gap: 18, fontSize: 27 }}
      >
        <span
          style={{
            display: "flex",
            width: 54,
            height: 2,
            backgroundColor: "#193b42",
          }}
        />
        <span>{siteName}</span>
      </div>
    </div>,
    {
      width: 1200,
      height: 630,
      headers: {
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    },
  );
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    const { slug } = await params;
    const api = createServerTravelApi();
    const site = await api.getSite();
    const post = await api.getPost({ site_id: site.id, slug });
    try {
      let assetId = post.cover_asset_id;
      if (!assetId && post.pdf_asset_id) {
        assetId = (
          await api.read("asset.access", {
            id: post.pdf_asset_id,
            site_id: site.id,
          })
        ).preview_asset_id;
      }
      if (assetId) {
        const asset = await api.read("asset.access", {
          id: assetId,
          site_id: site.id,
        });
        const upstream = await fetch(asset.url, {
          cache: "no-store",
          signal: AbortSignal.timeout(10000),
        });
        const contentType = upstream.headers.get("content-type")?.split(";")[0];
        if (
          upstream.ok &&
          ["image/jpeg", "image/png", "image/webp"].includes(contentType ?? "")
        ) {
          return new Response(upstream.body, {
            headers: {
              "Cache-Control": "no-store",
              "Content-Type": contentType!,
              "X-Content-Type-Options": "nosniff",
            },
          });
        }
      }
    } catch {
      // A published post still gets an image when its cover cannot be fetched.
    }
    return titleCard(
      post.title,
      CATEGORIES.find((item) => item.code === post.category_code)?.label ??
        "여행 기록",
      slug,
      site.name,
    );
  } catch (error) {
    const status =
      error instanceof TravelApiError && error.status === 404 ? 404 : 502;
    return new Response(status === 404 ? "Not found" : "Preview unavailable", {
      status,
      headers: { "Cache-Control": "no-store" },
    });
  }
}
