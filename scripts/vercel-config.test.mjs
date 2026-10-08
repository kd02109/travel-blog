import assert from "node:assert/strict";
import test from "node:test";

test("admin Preview has no scheduled media worker invocation", async () => {
  const previous = process.env.VERCEL_ENV;
  try {
    process.env.VERCEL_ENV = "preview";
    const { config } = await import("../apps/admin/vercel.mjs?preview");
    assert.deepEqual(config.crons, []);
  } finally {
    if (previous === undefined) delete process.env.VERCEL_ENV;
    else process.env.VERCEL_ENV = previous;
  }
});

test("admin production retains the one-minute media worker cron", async () => {
  const previous = process.env.VERCEL_ENV;
  try {
    process.env.VERCEL_ENV = "production";
    const { config } = await import("../apps/admin/vercel.mjs?production");
    assert.deepEqual(config.crons, [
      { path: "/api/internal/media-worker", schedule: "* * * * *" },
    ]);
  } finally {
    if (previous === undefined) delete process.env.VERCEL_ENV;
    else process.env.VERCEL_ENV = previous;
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
