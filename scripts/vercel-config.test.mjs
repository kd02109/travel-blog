import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("only dev and main trigger automatic web and admin deployments", async () => {
  const web = JSON.parse(
    readFileSync(new URL("../apps/web/vercel.json", import.meta.url), "utf8"),
  );
  const { config: admin } = await import("../apps/admin/vercel.mjs?git-policy");
  const policy = { "**": false, main: true, dev: true };
  assert.deepEqual(web.git?.deploymentEnabled, policy);
  assert.deepEqual(admin.git?.deploymentEnabled, policy);
});

test("admin Preview has no scheduled media worker invocation", async () => {
  const previous = process.env.VERCEL_ENV;
  const previousCron = process.env.TRAVEL_MEDIA_CRON_ENABLED;
  try {
    process.env.VERCEL_ENV = "preview";
    process.env.TRAVEL_MEDIA_CRON_ENABLED = "true";
    const { config } = await import("../apps/admin/vercel.mjs?preview");
    assert.deepEqual(config.crons, []);
  } finally {
    if (previous === undefined) delete process.env.VERCEL_ENV;
    else process.env.VERCEL_ENV = previous;
    if (previousCron === undefined)
      delete process.env.TRAVEL_MEDIA_CRON_ENABLED;
    else process.env.TRAVEL_MEDIA_CRON_ENABLED = previousCron;
  }
});

test("admin production starts without a media worker schedule", async () => {
  const previous = process.env.VERCEL_ENV;
  const previousCron = process.env.TRAVEL_MEDIA_CRON_ENABLED;
  try {
    process.env.VERCEL_ENV = "production";
    delete process.env.TRAVEL_MEDIA_CRON_ENABLED;
    const { config } =
      await import("../apps/admin/vercel.mjs?production-disabled");
    assert.deepEqual(config.crons, []);
  } finally {
    if (previous === undefined) delete process.env.VERCEL_ENV;
    else process.env.VERCEL_ENV = previous;
    if (previousCron === undefined)
      delete process.env.TRAVEL_MEDIA_CRON_ENABLED;
    else process.env.TRAVEL_MEDIA_CRON_ENABLED = previousCron;
  }
});

test("admin production registers one-minute Cron only by explicit opt-in", async () => {
  const previous = process.env.VERCEL_ENV;
  const previousCron = process.env.TRAVEL_MEDIA_CRON_ENABLED;
  try {
    process.env.VERCEL_ENV = "production";
    process.env.TRAVEL_MEDIA_CRON_ENABLED = "true";
    const { config } =
      await import("../apps/admin/vercel.mjs?production-enabled");
    assert.deepEqual(config.crons, [
      { path: "/api/internal/media-worker", schedule: "* * * * *" },
    ]);
  } finally {
    if (previous === undefined) delete process.env.VERCEL_ENV;
    else process.env.VERCEL_ENV = previous;
    if (previousCron === undefined)
      delete process.env.TRAVEL_MEDIA_CRON_ENABLED;
    else process.env.TRAVEL_MEDIA_CRON_ENABLED = previousCron;
  }
});

test("web Preview sends noindex headers and production does not", async () => {
  const previous = process.env.VERCEL_ENV;
  try {
    process.env.VERCEL_ENV = "preview";
    const { default: config } = await import("../apps/web/next.config.js");
    assert.deepEqual(await config.headers(), [
      {
        source: "/:path*",
        headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }],
      },
    ]);
    process.env.VERCEL_ENV = "production";
    assert.deepEqual(await config.headers(), []);
  } finally {
    if (previous === undefined) delete process.env.VERCEL_ENV;
    else process.env.VERCEL_ENV = previous;
  }
});

test("admin deployments send noindex headers", async () => {
  const previous = process.env.VERCEL_ENV;
  try {
    process.env.VERCEL_ENV = "preview";
    const { default: config } = await import("../apps/admin/next.config.js");
    assert.deepEqual(await config.headers(), [
      {
        source: "/:path*",
        headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }],
      },
    ]);
  } finally {
    if (previous === undefined) delete process.env.VERCEL_ENV;
    else process.env.VERCEL_ENV = previous;
  }
});
