// Exercise the built server route, where PDF.js module resolution differs from
// source-level tests. All network calls are replaced; no remote credentials run.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const app = resolve(root, "apps/admin");
const routePath = resolve(
  app,
  process.env.TRAVEL_NEXT_DIST_DIR || ".next",
  "server/app/api/internal/media-worker/route.js",
);
const trace = JSON.parse(readFileSync(`${routePath}.nft.json`, "utf8"));
assert(
  trace.files.some((file) => file.endsWith("/legacy/build/pdf.worker.mjs")),
);
assert(
  trace.files.some((file) => file.endsWith("/standard_fonts/FoxitSerif.pfb")),
);

const source = readFileSync(
  resolve(root, "apps/web/public/mock-assets/itinerary.pdf"),
);
const secret = "built-route-test-only-01234567890123456789";
Object.assign(process.env, {
  CRON_SECRET: secret,
  TRAVEL_MEDIA_WORKER_ENABLED: "true",
  SUPABASE_URL: "https://media-build.example.invalid",
  SUPABASE_SERVICE_ROLE_KEY: "sb_secret_build_test_only",
});
process.chdir(app);
const uploads = [];
let completion;
globalThis.fetch = async (url, init = {}) => {
  const target = new URL(String(url));
  assert.equal(target.origin, "https://media-build.example.invalid");
  if (target.pathname === "/rest/v1/rpc/travel_worker") {
    const { p_action: action, p_input: input } = JSON.parse(init.body);
    if (action === "claim") {
      return Response.json({
        job: {
          id: "job",
          attempts: 1,
          type: "process_asset",
          lease_until: "2030-01-01T00:00:00Z",
        },
        asset: {
          id: "asset",
          site_id: "site",
          kind: "pdf",
          bucket: "documents-private",
          object_path: "site/asset/source.pdf",
          state: "processing",
        },
      });
    }
    assert.equal(
      action,
      "complete",
      "The compiled route must process the PDF without failing",
    );
    completion = input;
    return Response.json({ completed: true });
  }
  if (
    target.pathname ===
    "/storage/v1/object/authenticated/documents-private/site/asset/source.pdf"
  ) {
    return new Response(source);
  }
  assert.equal(init.method, "POST");
  assert(
    target.pathname.startsWith(
      "/storage/v1/object/documents-private/site/asset/attempt-1/",
    ),
  );
  uploads.push({ path: target.pathname, bytes: Buffer.from(init.body) });
  return Response.json({});
};

const require = createRequire(import.meta.url);
const { routeModule } = require(routePath);
const response = await routeModule.userland.GET(
  new Request("https://media-build.example.invalid/api/internal/media-worker", {
    headers: { authorization: `Bearer ${secret}` },
  }),
);
assert.equal(response.status, 200);
assert.deepEqual(await response.json(), { kind: "asset", result: "processed" });
assert.equal(completion.metadata.page_count, 1);
assert.equal(uploads.length, 2);
assert.deepEqual(
  uploads.find((item) => item.path.endsWith("document.pdf")).bytes,
  source,
);
assert.deepEqual(
  [
    ...uploads
      .find((item) => item.path.endsWith("first-page.png"))
      .bytes.subarray(0, 8),
  ],
  [137, 80, 78, 71, 13, 10, 26, 10],
);
console.log(
  "Built media route: PDF document, first-page PNG, and runtime file trace passed",
);
