import { setTimeout as sleep } from "node:timers/promises";
import { createMediaWorkerFromEnv } from "./processor.ts";

const worker = createMediaWorkerFromEnv();
const once = process.env.MEDIA_WORKER_ONCE === "1";
let stopping = false;
let lastCleanupReport = 0;
let lastQueueReport = 0;

process.on("SIGTERM", () => {
  stopping = true;
});
process.on("SIGINT", () => {
  stopping = true;
});

console.info(
  JSON.stringify({
    event: "media_worker_started",
    mode: once ? "once" : "poll",
  }),
);

do {
  try {
    if (Date.now() - lastQueueReport > 60_000) {
      lastQueueReport = Date.now();
      await worker.reportQueueHealth();
    }
    if (Date.now() - lastCleanupReport > 60 * 60 * 1000) {
      lastCleanupReport = Date.now();
      await worker.reportCleanupCandidates();
    }
    const cleanup = await worker.processCleanupOnce();
    const asset = await worker.processAssetOnce();
    if (!once && cleanup === "idle" && asset === "idle") await sleep(5_000);
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    console.error(
      JSON.stringify({
        event: "media_worker_poll_failed",
        code: /^[a-z][a-z0-9_]{0,63}$/.test(message) ? message : "poll_error",
      }),
    );
    if (!once) await sleep(15_000);
  }
} while (!once && !stopping);
