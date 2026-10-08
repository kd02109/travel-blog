import test from "node:test";

// This suite creates visitor/rate-limit state. Target only the isolated
// staging project so a routine test cannot mutate the existing travel-blog DB.
const url = "https://bnfihijsquvvkneoutie.supabase.co/functions/v1/travel-api";
function assert(ok: unknown, message: string) {
  if (!ok) throw new Error(message);
}
async function call(
  action: string,
  input: unknown = {},
  headers: Record<string, string> = {},
) {
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify({ action, input }),
    signal: AbortSignal.timeout(15000),
  });
  return { status: r.status, body: await r.json(), headers: r.headers };
}
test("deployed API health and empty site reads", async () => {
  const health = await fetch(url, { signal: AbortSignal.timeout(15000) });
  assert(health.status === 200, "health HTTP");
  await health.body?.cancel();
  const site = await call("site.get");
  assert(site.status === 200, "site read " + JSON.stringify(site.body));
  assert(site.body.name === "오늘도 함께 걷다", "site name");
  const posts = await call("posts.list", { site_id: site.body.id });
  assert(
    posts.status === 200 &&
      Array.isArray(posts.body) &&
      posts.body.length === 0,
    "empty posts",
  );
});
test("deployed API restricts browser CORS to configured staging origins", async () => {
  for (const origin of ["http://localhost:3000", "http://localhost:3002"]) {
    const preflight = await fetch(url, {
      method: "OPTIONS",
      headers: {
        Origin: origin,
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "content-type",
      },
      signal: AbortSignal.timeout(15000),
    });
    assert(preflight.status === 204, `${origin} preflight status`);
    assert(
      preflight.headers.get("access-control-allow-origin") === origin,
      `${origin} preflight ACAO`,
    );
    assert(
      preflight.headers
        .get("vary")
        ?.split(",")
        .some((part) => part.trim().toLowerCase() === "origin"),
      `${origin} vary`,
    );
  }
  const allowed = await call(
    "site.get",
    {},
    { Origin: "http://localhost:3000" },
  );
  assert(allowed.status === 200, "allowed browser POST status");
  assert(
    allowed.headers.get("access-control-allow-origin") ===
      "http://localhost:3000",
    "allowed browser POST ACAO",
  );
  const denied = await call(
    "site.get",
    {},
    { Origin: "https://untrusted.example" },
  );
  assert(denied.status === 403, "untrusted browser POST status");
  assert(denied.body.error === "origin_not_allowed", "untrusted browser body");
  assert(
    denied.headers.get("access-control-allow-origin") === null,
    "untrusted browser ACAO",
  );
});
test("deployed API refuses unauthenticated admin and internal actions", async () => {
  for (const action of [
    "admin.posts",
    "admin.member.set",
    "admin.errors",
    "admin.error.get",
    "asset.create",
  ]) {
    assert((await call(action)).status === 401, action);
  }
  assert(
    (await call("error.capture")).status === 403,
    "error capture without server key",
  );
  assert(
    (await call("comment.credential")).status === 400,
    "credential leaked",
  );
  assert((await call("rate.consume")).status === 400, "rate RPC leaked");
  assert(
    (await call("me", {}, { Authorization: "Bearer invalid.jwt.token" }))
      .status === 401,
    "invalid JWT accepted",
  );
});
test("deployed API visitor signing and privilege spoof protection", async () => {
  const visitor = await call("visitor.create");
  assert(visitor.status === 200, "visitor created");
  assert(
    visitor.headers.get("set-cookie")?.includes("HttpOnly"),
    "HttpOnly cookie",
  );
  const bad = await call(
    "like.set",
    { id: crypto.randomUUID(), liked: true },
    {
      "x-visitor-token": visitor.body.visitor_token + "x",
    },
  );
  assert(bad.status === 401, "tampered visitor accepted");
  const good = await call(
    "like.set",
    {
      id: crypto.randomUUID(),
      liked: true,
      guest_verified: true,
      actor_hash: "spoof",
    },
    { "x-visitor-token": visitor.body.visitor_token },
  );
  assert(
    good.status === 403,
    "nonexistent post accepted " + JSON.stringify(good.body),
  );
});
