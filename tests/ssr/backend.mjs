// Test-only HTTP backend. Loopback only; never uses remote credentials or data.
import { createServer } from "node:http";
const id = (n) => `10000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const site = {
  id: id(1),
  slug: "parents-travel",
  name: "격리 SSR 여행",
  settings: { template_id: "D" },
  version: 0,
};
const posts = Array.from({ length: 13 }, (_, i) => ({
  post_id: id(i + 2),
  site_id: site.id,
  slug: `ssr-trip-${i + 1}`,
  title: `SSR 여행 ${i + 1}`,
  category_code: "day-walk",
  tags: ["격리 테스트"],
  metadata: {},
  cover_asset_id: id(99),
  pdf_asset_id: null,
  published_at: "2026-09-26T00:00:00Z",
  updated_at: "2026-09-26T00:00:00Z",
  like_count: 0,
  comment_count: 0,
  comments_enabled: true,
  body_html: "<p>서버에서 전달한 여행 본문</p>",
}));
const requests = [];
const server = createServer(async (req, res) => {
  const send = (data, status = 200) => {
    res.writeHead(status, {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    });
    res.end(JSON.stringify(data));
  };
  if (req.url === "/health") return send({ ok: true });
  if (req.url === "/requests") return send(requests);
  if (req.url !== "/functions/v1/travel-api" || req.method !== "POST")
    return send({ error: "not_found" }, 404);
  let text = "";
  for await (const chunk of req) {
    text += chunk;
    if (text.length > 100000) {
      return send({ error: "too_large" }, 413);
    }
  }
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    return send({ error: "invalid_json" }, 400);
  }
  const { action, input = {} } = body;
  requests.push({
    action,
    input,
    hasAuthorization: Boolean(req.headers.authorization),
  });
  if (action === "site.get") return send(site);
  if (action === "posts.list") {
    const { offset = 0, limit = 12 } = input;
    return send(
      posts
        .slice(offset, offset + limit)
        .map(({ site_id, body_html, comments_enabled, ...card }) => card),
    );
  }
  if (action === "post.get") {
    const post = posts.find((p) =>
      input.id ? p.post_id === input.id : p.slug === input.slug,
    );
    return post
      ? send(post)
      : send({ error: "not_found", request_id: "ssr-404" }, 404);
  }
  if (action === "comments.list") return send([]);
  return send({ error: "login_required", request_id: "ssr-401" }, 401);
});
server.listen(3049, "127.0.0.1", () =>
  console.log("Isolated SSR HTTP backend ready on 3049"),
);
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => server.close(() => process.exit(0)));
