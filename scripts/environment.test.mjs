import { afterEach, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createAppEnvironment } from "./environment.mjs";
const roots = [];
afterEach(() => {
  for (const root of roots.splice(0))
    rmSync(root, { recursive: true, force: true });
});
function fixture(shared = "", local = "") {
  const root = mkdtempSync(join(tmpdir(), "travel-profile-"));
  roots.push(root);
  mkdirSync(join(root, "apps", "web"), { recursive: true });
  writeFileSync(join(root, ".env.supabase.local"), shared);
  writeFileSync(join(root, "apps", "web", ".env.supabase.local"), local);
  return root;
}
const valid =
  "NEXT_PUBLIC_SUPABASE_URL=https://example.supabase.co\nNEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_example\n";
test("mock ignores profile files and clears live credentials and telemetry", () => {
  const root = fixture(valid);
  const env = createAppEnvironment({
    root,
    app: "web",
    mode: "mock",
    inherited: {
      NEXT_PUBLIC_API_MOCKING: "disabled",
      NEXT_PUBLIC_SUPABASE_URL: "https://real.supabase.co",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_real",
      SUPABASE_SECRET_KEY: "sb_secret_private",
      NEXT_PUBLIC_ANALYTICS_ENABLED: "true",
      NEXT_PUBLIC_ERROR_MONITORING_ENABLED: "true",
      TRAVEL_ERROR_REPORT_KEY: "private",
    },
  });
  assert.equal(env.NEXT_PUBLIC_API_MOCKING, "enabled");
  assert.equal(env.NEXT_PUBLIC_SUPABASE_URL, "");
  assert.equal(env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, "");
  assert.equal(env.SUPABASE_SECRET_KEY, "");
  assert.equal(env.NEXT_PUBLIC_ANALYTICS_ENABLED, "false");
  assert.equal(env.NEXT_PUBLIC_ERROR_MONITORING_ENABLED, "");
  assert.equal(env.TRAVEL_ERROR_REPORT_KEY, "");
});
test("supabase forces mock off even when shell or profile enables it", () => {
  const root = fixture(valid + "NEXT_PUBLIC_API_MOCKING=enabled\n");
  const env = createAppEnvironment({
    root,
    app: "web",
    mode: "supabase",
    inherited: { NEXT_PUBLIC_API_MOCKING: "enabled" },
  });
  assert.equal(env.NEXT_PUBLIC_API_MOCKING, "disabled");
  assert.equal(env.NEXT_PUBLIC_SUPABASE_URL, "https://example.supabase.co");
});
test("precedence is shell > app profile > shared profile", () => {
  const root = fixture(
    valid +
      "NEXT_PUBLIC_DEPLOY_ENV=preview\nNEXT_PUBLIC_SITE_URL=https://shared.example\n",
    "NEXT_PUBLIC_DEPLOY_ENV=production\nNEXT_PUBLIC_SITE_URL=https://web.example\n",
  );
  const env = createAppEnvironment({
    root,
    app: "web",
    mode: "supabase",
    inherited: { NEXT_PUBLIC_SITE_URL: "https://shell.example" },
  });
  assert.equal(env.NEXT_PUBLIC_DEPLOY_ENV, "production");
  assert.equal(env.NEXT_PUBLIC_SITE_URL, "https://shell.example");
});
test("missing credentials fail with variable names, never values", () => {
  const root = fixture(
    "NEXT_PUBLIC_SUPABASE_URL=https://example.supabase.co\n",
  );
  assert.throws(
    () =>
      createAppEnvironment({
        root,
        app: "web",
        mode: "supabase",
        inherited: {},
      }),
    /NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY 설정이 필요/,
  );
});
test("rejects secret and service_role keys in the public key slot", () => {
  const root = fixture(valid);
  for (const key of [
    "sb_secret_private",
    `header.${Buffer.from(JSON.stringify({ role: "service_role" })).toString("base64url")}.signature`,
  ]) {
    assert.throws(
      () =>
        createAppEnvironment({
          root,
          app: "web",
          mode: "supabase",
          inherited: { NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: key },
        }),
      (error) => !error.message.includes(key),
    );
  }
});
test("supports legacy anon keys without treating them as user bearer tokens", () => {
  const root = fixture(valid);
  const key = `header.${Buffer.from(JSON.stringify({ role: "anon" })).toString("base64url")}.signature`;
  assert.equal(
    createAppEnvironment({
      root,
      app: "web",
      mode: "supabase",
      inherited: { NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: key },
    }).NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    key,
  );
});
test("rejects unexpected modes and non-HTTPS/origin SaaS URLs", () => {
  const root = fixture(valid);
  assert.throws(() =>
    createAppEnvironment({ root, app: "web", mode: "invalid", inherited: {} }),
  );
  for (const url of [
    "http://example.supabase.co",
    "https://example.supabase.co/path",
    "https://user:pass@example.supabase.co",
    "https://example.supabase.co?x=y",
  ]) {
    assert.throws(() =>
      createAppEnvironment({
        root,
        app: "web",
        mode: "supabase",
        inherited: { NEXT_PUBLIC_SUPABASE_URL: url },
      }),
    );
  }
});
test("app ports are isolated and mode selection does not mutate process input", () => {
  const root = fixture();
  const inherited = { NEXT_PUBLIC_API_MOCKING: "disabled" };
  assert.equal(
    createAppEnvironment({ root, app: "admin", mode: "mock", inherited })
      .NEXT_PUBLIC_SITE_URL,
    "http://localhost:3002",
  );
  assert.equal(inherited.NEXT_PUBLIC_API_MOCKING, "disabled");
});
