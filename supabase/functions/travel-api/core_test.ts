import {
  ApiError,
  cleanInput,
  renderBlocks,
  sniff,
  validateAction,
} from "./core.ts";
import { argon2id, argon2Verify } from "npm:hash-wasm@4.12.0";
function assert(ok: unknown, message = "assertion failed"): asserts ok {
  if (!ok) throw new Error(message);
}
function rejects(f: () => unknown, status: number) {
  try {
    f();
  } catch (e) {
    assert(e instanceof ApiError && e.status === status);
    return;
  }
  throw new Error("expected rejection");
}
Deno.test("internal RPC actions cannot be called by clients", () => {
  for (
    const action of [
      "comment.credential",
      "rate.consume",
      "asset.internal",
      "worker.complete",
      "unknown",
    ]
  ) rejects(() => validateAction(action), 400);
  assert(validateAction("admin.post.publish") === "admin.post.publish");
  assert(validateAction("admin.post.published") === "admin.post.published");
  assert(validateAction("admin.revision.get") === "admin.revision.get");
  assert(validateAction("admin.revision.delete") === "admin.revision.delete");
});
Deno.test("server-only authorization and render fields are removed", () => {
  const input = cleanInput({
    actor_hash: "attacker",
    guest_verified: true,
    password_hash: "attacker",
    rendered_html: "<script>x</script>",
    asset_ids: ["x"],
    p_actor: "admin",
    body: "hello",
  });
  assert(Object.keys(input).join(",") === "body");
  rejects(() => cleanInput({ id: "not-uuid" }), 400);
});
Deno.test("renderer escapes text and unsafe URLs", () => {
  const output = renderBlocks([{
    type: "paragraph",
    content: "<script>alert(1)</script>",
  }]);
  assert(!output.html.includes("<script>"));
  rejects(
    () =>
      renderBlocks([{
        type: "paragraph",
        content: [{
          type: "link",
          href: "javascript:alert(1)",
          content: "click",
        }],
      }]),
    422,
  );
  rejects(() => renderBlocks([{ type: "html", content: "<iframe>" }]), 422);
});
Deno.test("renderer preserves safe links and extracts validated file IDs", () => {
  const id = "00000000-0000-0000-0000-000000000001";
  const output = renderBlocks([{
    type: "image",
    props: { asset_id: id, caption: "<img onerror=x>" },
  }, {
    type: "paragraph",
    content: [{
      type: "link",
      href: "https://example.com",
      content: [{ type: "text", text: "Example" }],
    }],
  }]);
  assert(output.assetIds[0] === id);
  assert(output.html.includes("&lt;img"));
  assert(output.html.includes('rel="nofollow noopener noreferrer"'));
});
Deno.test("renderer pairs adjacent images with safe layout attributes", () => {
  const first = "00000000-0000-0000-0000-000000000001";
  const second = "00000000-0000-0000-0000-000000000002";
  const output = renderBlocks([
    { type: "image", props: { asset_id: first, caption: "첫 사진", width: "small", align: "left", layout: "pair", width_pct: 65, position_pct: 25 } },
    { type: "image", props: { asset_id: second, caption: "둘째 사진", width: "medium", align: "right", layout: "pair" } },
    { type: "image", props: { asset_id: first, caption: "다시", width: '" onmouseover="x', align: "invalid", layout: "pair" } },
  ]);
  assert(output.html.includes('<div data-image-pair>'));
  assert((output.html.match(/<div data-image-pair>/g) ?? []).length === 1);
  assert(output.html.includes('data-image-width="small" data-image-align="left" data-image-layout="pair"'));
  assert(output.html.includes('data-image-layout="pair" data-image-custom="true" data-image-width-pct="65"'));
  assert(output.html.includes('data-image-width="medium" data-image-align="right" data-image-layout="pair"'));
  assert(!output.html.includes("onmouseover"));
  assert(output.assetIds.length === 2);
});
Deno.test("renderer keeps dragged image geometry within a safe article flow", () => {
  const id = "00000000-0000-0000-0000-000000000001";
  const image = (props: Record<string, unknown>) => ({
    type: "image",
    props: { asset_id: id, ...props },
  });
  const output = renderBlocks([
    image({ width_pct: 62, position_pct: 40 }),
    image({ width_pct: 42, position_pct: 100, layout: "pair" }),
    image({ width_pct: '65%;color:red', position_pct: 50 }),
    image({ width_pct: 125, position_pct: -10 }),
  ]);
  assert(output.html.includes('data-image-width-pct="62"'));
  assert(output.html.includes('data-image-position-pct="40"'));
  assert(output.html.includes('style="--image-width:62%;--image-offset:15.2%"'));
  assert((output.html.match(/data-image-custom="true"/g) ?? []).length === 1);
  assert(!output.html.includes("color:red"));
});
Deno.test("file signature checked independently of filename", () => {
  assert(sniff(new TextEncoder().encode("%PDF-1.7\n")) === "application/pdf");
  assert(
    sniff(new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])) === "image/png",
  );
  rejects(() => sniff(new TextEncoder().encode("<script>")), 422);
});
Deno.test("Argon2id hash verifies only the correct password", async () => {
  const hash = await argon2id({
    password: "test-password-123",
    salt: crypto.getRandomValues(new Uint8Array(16)),
    parallelism: 1,
    iterations: 2,
    memorySize: 19456,
    hashLength: 32,
    outputType: "encoded",
  });
  assert(hash.startsWith("$argon2id$"));
  assert(await argon2Verify({ password: "test-password-123", hash }));
  assert(!await argon2Verify({ password: "wrong-password", hash }));
});
