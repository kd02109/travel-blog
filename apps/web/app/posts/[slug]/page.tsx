import { notFound } from "next/navigation";
import { createServerTravelApi } from "@repo/api-client/server";
import { TravelApiError } from "@repo/api-client";
export const dynamic = "force-dynamic";
export default async function Post({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const api = createServerTravelApi();
  const site = await api.getSite();
  const post = await api.getPost({ site_id: site.id, slug }).catch((error) => {
    if (error instanceof TravelApiError && error.status === 404) notFound();
    throw error;
  });
  return (
    <main className="mx-auto max-w-3xl p-8">
      <article>
        <h1>{post.title}</h1>
        <p>{post.category_code}</p>
        <p>{post.tags.join(" · ")}</p>
      </article>
    </main>
  );
}
