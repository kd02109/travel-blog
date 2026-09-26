import { createServerTravelApi } from "@repo/api-client/server";
import { TravelApiError } from "@repo/api-client";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await params;
    const api = createServerTravelApi();
    const site = await api.getSite();
    const post = await api.getPost({ site_id: site.id, slug });
    let assetId = post.cover_asset_id;
    if (!assetId && post.pdf_asset_id) {
      assetId = (await api.read("asset.access", { id: post.pdf_asset_id, site_id: site.id })).preview_asset_id;
    }
    if (!assetId) return new Response("Not found", { status: 404, headers: { "Cache-Control": "no-store" } });
    const asset = await api.read("asset.access", { id: assetId, site_id: site.id });
    const upstream = await fetch(asset.url, { cache: "no-store", signal: AbortSignal.timeout(10000) });
    if (!upstream.ok) return new Response("Preview unavailable", { status: 502, headers: { "Cache-Control": "no-store" } });
    return new Response(upstream.body, {
      headers: {
        "Cache-Control": "no-store",
        "Content-Type": upstream.headers.get("content-type") ?? "image/jpeg",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    const status = error instanceof TravelApiError && error.status === 404 ? 404 : 502;
    return new Response(status === 404 ? "Not found" : "Preview unavailable", { status, headers: { "Cache-Control": "no-store" } });
  }
}
