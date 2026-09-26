import type { MetadataRoute } from "next";
import { createServerTravelApi } from "@repo/api-client/server";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const origin = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const fixed = ["/", "/posts", "/about", "/contents"].map((path) => ({
    url: new URL(path, origin).toString(),
  }));
  try {
    const api = createServerTravelApi();
    const site = await api.getSite();
    const posts: Array<{ slug: string; updated_at: string }> = [];
    for (let offset = 0; offset < 100000; offset += 50) {
      const page = await api.listPosts({ site_id: site.id, limit: 50, offset });
      posts.push(...page.map(({ slug, updated_at }) => ({ slug, updated_at })));
      if (page.length < 50) break;
    }
    return [
      ...fixed,
      ...posts.map((post) => ({
        url: new URL(`/posts/${encodeURIComponent(post.slug)}`, origin).toString(),
        lastModified: new Date(post.updated_at),
      })),
    ];
  } catch {
    return fixed;
  }
}
