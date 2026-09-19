import { createTravelApi } from "@repo/api-client";
export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) return Response.json({ error: "not_configured" }, { status: 503 });
  try {
    return Response.json(
      await createTravelApi({
        baseURL: `${url}/functions/v1/travel-api`,
      }).getSite(),
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return Response.json({ error: "upstream_unavailable" }, { status: 502 });
  }
}
