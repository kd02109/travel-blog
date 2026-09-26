import Link from "next/link";
import { createServerTravelApi } from "@repo/api-client/server";
export const dynamic = "force-dynamic";
export default async function Posts({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  if (
    process.env.NEXT_PUBLIC_API_MOCKING === "enabled" &&
    !process.env.TRAVEL_SSR_API_URL
  )
    return (
      <main>
        <p>예시 목록은 브라우저 API 체험에서 확인할 수 있습니다.</p>
        <Link href="/playground">API 체험</Link>
      </main>
    );
  const params = await searchParams;
  const page = Math.min(
    8334,
    Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1),
  );
  const api = createServerTravelApi();
  const site = await api.getSite();
  const posts = await api.listPosts({
    site_id: site.id,
    limit: 12,
    offset: (page - 1) * 12,
  });
  return (
    <main className="mx-auto max-w-3xl p-8">
      <h1>여행 기록</h1>
      <ul>
        {posts.map((post) => (
          <li key={post.post_id}>
            <Link href={`/posts/${encodeURIComponent(post.slug)}`}>
              {post.title}
            </Link>
          </li>
        ))}
      </ul>
      {posts.length === 0 && <p>여행 기록을 준비하고 있어요.</p>}
      <nav aria-label="페이지 이동">
        {page > 1 && <Link href={`/posts?page=${page - 1}`}>이전</Link>}
        {posts.length === 12 && (
          <Link href={`/posts?page=${page + 1}`}>다음</Link>
        )}
      </nav>
    </main>
  );
}
