// Disposable local stack only. Never uses .env files or a remote service key.
import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
const root = resolve(import.meta.dirname, "..");
const workdir = process.argv[2];
assert(
  workdir?.startsWith("/private/tmp/travel-auth-replay."),
  "Pass a disposable replay workspace under /private/tmp/travel-auth-replay.*",
);
assert.match(
  readFileSync(resolve(workdir, "supabase/config.toml"), "utf8"),
  /project_id\s*=\s*"travel-auth-replay"/,
);
const status = JSON.parse(
  execFileSync(
    "pnpm",
    ["exec", "supabase", "status", "--workdir", workdir, "--output", "json"],
    { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
  ),
);
assert.equal(status.API_URL, "http://127.0.0.1:55431");
const base = status.API_URL;
const require = createRequire(resolve(root, "packages/database/package.json"));
const { createClient } = require("@supabase/supabase-js");
const { createServerClient } = require("@supabase/ssr");
const admin = createClient(base, status.SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const suffix = randomUUID();
const email = `owner-${suffix}@example.test`;
function sql(input) {
  return execFileSync(
    "docker",
    [
      "exec",
      "-i",
      "supabase_db_travel-auth-replay",
      "psql",
      "-U",
      "postgres",
      "-d",
      "postgres",
      "-v",
      "ON_ERROR_STOP=1",
      "-At",
    ],
    { input, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] },
  );
}
// Fail closed on reuse; these tests expect an empty disposable DB.
sql(`do $$ begin if exists(select 1 from auth.users) then raise exception 'Expected empty Auth database'; end if; end $$;
insert into app_private.owner_bootstrap_targets(site_id,email) select id,'${email}' from app_private.sites where slug='parents-travel';`);
async function user(email) {
  const password = `Test-${randomUUID()}!`;
  const result = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  assert.equal(result.error, null, "local fixture user creation");
  const db = createClient(base, status.ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const login = await db.auth.signInWithPassword({ email, password });
  assert.equal(login.error, null, "local Auth sign in");
  return { id: result.data.user.id, session: login.data.session };
}
const owner = await user(email);
const editor = await user(`editor-${suffix}@example.test`);
const reader = await user(`reader-${suffix}@example.test`);
async function api(action, input, actor) {
  return fetch(`${base}/functions/v1/travel-api`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(actor
        ? { Authorization: `Bearer ${actor.session.access_token}` }
        : {}),
    },
    body: JSON.stringify({ action, input }),
  });
}
const siteResponse = await api("site.get", { slug: "parents-travel" });
assert.equal(siteResponse.status, 200, "local Edge function must be served");
const site = await siteResponse.json();
assert.equal(
  (
    await api(
      "admin.member.set",
      { site_id: site.id, user_id: editor.id, role: "editor", active: true },
      owner,
    )
  ).status,
  200,
);
async function cookie(actor) {
  const jar = new Map();
  const client = createServerClient(base, status.ANON_KEY, {
    cookies: {
      getAll: () => [],
      setAll: (values) =>
        values.forEach(({ name, value }) => jar.set(name, value)),
    },
  });
  const { error } = await client.auth.setSession(actor.session);
  assert.equal(error, null);
  return [...jar].map(([name, value]) => `${name}=${value}`).join("; ");
}
const ownerCookie = await cookie(owner);
const editorCookie = await cookie(editor);
const readerCookie = await cookie(reader);
// Test-owned cookies only: expired session plus an invalid refresh token.
const chunks = readerCookie.split("; ").map((part) => {
  const index = part.indexOf("=");
  return [part.slice(0, index), part.slice(index + 1)];
});
const cookieName = chunks[0][0].replace(/\.\d+$/, "");
const rawCookie = chunks.map(([, value]) => value).join("");
assert(rawCookie.startsWith("base64-"));
const expired = JSON.parse(
  Buffer.from(rawCookie.slice(7), "base64url").toString(),
);
expired.expires_at = 1;
expired.refresh_token = randomUUID();
const expiredCookie = `${cookieName}=base64-${Buffer.from(JSON.stringify(expired)).toString("base64url")}`;
const servers = [];
try {
  for (const [app, port] of [
    ["web", 3100],
    ["admin", 3102],
  ]) {
    const appRequire = createRequire(resolve(root, `apps/${app}/package.json`));
    const server = spawn(
      process.execPath,
      [appRequire.resolve("next/dist/bin/next"), "dev", "--port", String(port)],
      {
        cwd: resolve(root, `apps/${app}`),
        stdio: "ignore",
        env: {
          ...process.env,
          NODE_ENV: "development",
          NEXT_PUBLIC_SUPABASE_URL: base,
          NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: status.ANON_KEY,
          NEXT_PUBLIC_SITE_URL: `http://localhost:${port}`,
          NEXT_PUBLIC_API_MOCKING: "disabled",
          NEXT_PUBLIC_ERROR_MONITORING_ENABLED: "false",
          NEXT_PUBLIC_ANALYTICS_ENABLED: "false",
        },
      },
    );
    servers.push(server);
    let ready = false;
    for (let attempt = 0; attempt < 60; attempt++) {
      if (server.exitCode !== null) throw new Error(`${app} failed to start`);
      try {
        ready = (
          await fetch(`http://localhost:${port}/api/health`, {
            signal: AbortSignal.timeout(1000),
          })
        ).ok;
      } catch {
        /* starting */
      }
      if (ready) break;
      await delay(500);
    }
    assert(ready, `${app} readiness`);
  }
  const writer = (cookie) =>
    fetch("http://localhost:3102/write", {
      headers: cookie ? { cookie } : {},
      redirect: "manual",
    });
  assert.equal((await writer(ownerCookie)).status, 200, "owner access");
  assert.equal((await writer(editorCookie)).status, 200, "editor access");
  assert.match(
    (await writer(readerCookie)).headers.get("location"),
    /\/forbidden$/,
  );
  assert.match((await writer()).headers.get("location"), /error=expired$/);
  assert.match(
    (await writer(expiredCookie)).headers.get("location"),
    /error=expired$/,
    "expired session cannot enter writer",
  );
  assert.equal(
    (
      await api(
        "admin.member.set",
        { site_id: site.id, user_id: editor.id, role: "editor", active: false },
        owner,
      )
    ).status,
    200,
  );
  assert.match(
    (await writer(editorCookie)).headers.get("location"),
    /\/forbidden$/,
    "same session denied after revocation",
  );
  assert.equal(
    (await api("admin.posts", { site_id: site.id }, editor)).status,
    403,
  );
  assert.equal(
    (
      await api(
        "admin.post.create",
        { site_id: site.id, kind: "article", content: {} },
        editor,
      )
    ).status,
    403,
  );
  console.log(
    "PASS · real local Auth + Edge: owner/editor access, reader denial, same-token revocation read/write denial",
  );
  for (const port of [3100, 3102]) {
    const signedIn = await user(`logout-${port}-${suffix}@example.test`);
    const headers = {
      cookie: await cookie(signedIn),
      origin: `http://localhost:${port}`,
    };
    const response = await fetch(`http://localhost:${port}/auth/signout`, {
      method: "POST",
      headers,
      redirect: "manual",
    });
    assert.equal(response.status, 303);
    assert.equal(
      response.headers.get("location"),
      port === 3100
        ? `http://localhost:${port}/`
        : `http://localhost:${port}/login?status=signed_out`,
    );
    assert(
      response.headers.getSetCookie().some((value) => /Max-Age=0/i.test(value)),
      "session cookie cleared",
    );
    const refresh = await fetch(
      `${base}/auth/v1/token?grant_type=refresh_token`,
      {
        method: "POST",
        headers: {
          apikey: status.ANON_KEY,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ refresh_token: signedIn.session.refresh_token }),
      },
    );
    assert.equal(refresh.status, 400, "signed-out refresh token rejected");
    console.log(
      `PASS · ${port}: session cookies cleared and refresh token revoked`,
    );
  }
} finally {
  for (const server of servers) server.kill("SIGTERM");
  await Promise.all(
    servers.map((server) =>
      server.exitCode !== null
        ? undefined
        : new Promise((done) => server.once("exit", done)),
    ),
  );
}
