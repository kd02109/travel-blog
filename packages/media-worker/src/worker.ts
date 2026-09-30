import { createHash } from "node:crypto";
import { setTimeout as sleep } from "node:timers/promises";
import { createCanvas } from "@napi-rs/canvas";
import { createClient } from "@supabase/supabase-js";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import sharp from "sharp";
import { createWorkerFetch, workerApiKeyHeaders } from "./request-auth.ts";

const base = process.env.SUPABASE_URL?.replace(/\/$/, "");
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!base || !key)
  throw new Error("SUPABASE_URL and worker service key are required");

const MAX_BYTES = 20 * 1024 * 1024;
const MAX_PIXELS = 40_000_000;
const MAX_PAGES = 200;
const headers = workerApiKeyHeaders(key);
const workerFetch = createWorkerFetch(key);
const supabase = createClient(base, key, {
  auth: { autoRefreshToken: false, persistSession: false },
  global: { fetch: workerFetch },
});
type MediaAsset = {
  id: string;
  site_id: string;
  kind: "image" | "pdf";
  bucket: string;
  object_path: string;
  state: string;
};
type MediaJob = {
  id: string;
  lease_until: string;
  attempts: number;
  type: string;
};
type ClaimedJob = { job: MediaJob; asset: MediaAsset };
let stopping = false;
let lastCleanupReport = 0;
let lastQueueReport = 0;
process.on("SIGTERM", () => {
  stopping = true;
});
process.on("SIGINT", () => {
  stopping = true;
});

async function request(url: string, init: RequestInit = {}) {
  const response = await fetch(url, {
    ...init,
    headers: { ...headers, ...init.headers },
    signal: init.signal ?? AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`remote_${response.status}`);
  return response;
}

async function rpc(
  action: string,
  input: Record<string, unknown>,
  fn = "travel_worker",
) {
  const response = await request(`${base}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ p_action: action, p_input: input }),
  });
  return response.json();
}

function digest(bytes: Uint8Array) {
  return createHash("sha256").update(bytes).digest("hex");
}

async function download(bucket: string, path: string) {
  const encoded = path.split("/").map(encodeURIComponent).join("/");
  const response = await request(
    `${base}/storage/v1/object/authenticated/${encodeURIComponent(bucket)}/${encoded}`,
  );
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (!bytes.byteLength || bytes.byteLength > MAX_BYTES)
    throw new Error("invalid_file_size");
  return bytes;
}

async function upload(
  bucket: string,
  path: string,
  bytes: Uint8Array,
  mime: string,
) {
  if (!bytes.byteLength || bytes.byteLength > MAX_BYTES)
    throw new Error("invalid_output_size");
  const encoded = `${encodeURIComponent(bucket)}/${path.split("/").map(encodeURIComponent).join("/")}`;
  await request(`${base}/storage/v1/object/${encoded}`, {
    method: "POST",
    headers: { "Content-Type": mime, "x-upsert": "false" },
    body: Buffer.from(bytes),
  });
}

async function image(source: Uint8Array) {
  const pipeline = sharp(source, {
    limitInputPixels: MAX_PIXELS,
    failOn: "error",
  });
  const info = await pipeline.metadata();
  if (!info.width || !info.height || info.width * info.height > MAX_PIXELS)
    throw new Error("too_many_pixels");
  const output = await pipeline
    .rotate()
    .resize({
      width: 1600,
      height: 1600,
      fit: "inside",
      withoutEnlargement: true,
    })
    .jpeg({ quality: 85, mozjpeg: true })
    .toBuffer();
  const metadata = await sharp(output).metadata();
  return {
    bytes: output,
    metadata: {
      mime: "image/jpeg",
      bytes: output.length,
      checksum: digest(output),
      width: metadata.width,
      height: metadata.height,
    },
  };
}

async function pdf(source: Uint8Array) {
  if (new TextDecoder().decode(source.subarray(0, 5)) !== "%PDF-")
    throw new Error("invalid_pdf");
  const document = await getDocument({
    data: source,
    stopAtErrors: true,
    isEvalSupported: false,
  }).promise;
  try {
    if (document.numPages < 1 || document.numPages > MAX_PAGES)
      throw new Error("invalid_page_count");
    const page = await document.getPage(1);
    const baseViewport = page.getViewport({ scale: 1 });
    if (
      !Number.isFinite(baseViewport.width) ||
      !Number.isFinite(baseViewport.height) ||
      baseViewport.width <= 0 ||
      baseViewport.height <= 0
    )
      throw new Error("invalid_page_size");
    const scale = Math.min(
      1200 / baseViewport.width,
      1600 / baseViewport.height,
    );
    const viewport = page.getViewport({ scale });
    const canvas = createCanvas(
      Math.ceil(viewport.width),
      Math.ceil(viewport.height),
    );
    const context = canvas.getContext("2d");
    await page.render({
      canvas: canvas as unknown as HTMLCanvasElement,
      canvasContext: context as never,
      viewport,
    }).promise;
    const preview = new Uint8Array(await canvas.encode("png"));
    page.cleanup();
    return {
      preview,
      pages: document.numPages,
      metadata: {
        mime: "application/pdf",
        bytes: source.length,
        checksum: digest(source),
        page_count: document.numPages,
      },
      previewMetadata: {
        mime: "image/png",
        bytes: preview.length,
        checksum: digest(preview),
        width: canvas.width,
        height: canvas.height,
      },
    };
  } finally {
    await document.destroy();
  }
}

async function handle(item: ClaimedJob) {
  const { job, asset } = item;
  const proof = {
    job_id: job.id,
    lease_until: job.lease_until,
    attempt: job.attempts,
  };
  const source = await download(asset.bucket, asset.object_path);
  const prefix = `${asset.site_id}/${asset.id}/attempt-${job.attempts}`;
  if (asset.kind === "image") {
    const result = await image(source);
    const path = `${prefix}/processed.jpg`;
    await upload(asset.bucket, path, result.bytes, "image/jpeg");
    await rpc("complete", {
      ...proof,
      metadata: result.metadata,
      object_path: path,
    });
  } else {
    const result = await pdf(source);
    const documentPath = `${prefix}/document.pdf`;
    const previewPath = `${prefix}/first-page.png`;
    await upload(asset.bucket, documentPath, source, "application/pdf");
    await upload("documents-private", previewPath, result.preview, "image/png");
    await rpc("complete", {
      ...proof,
      metadata: result.metadata,
      object_path: documentPath,
      preview_path: previewPath,
      preview_metadata: result.previewMetadata,
    });
  }
  console.info(
    JSON.stringify({
      event: "media_job_done",
      job_id: job.id,
      kind: asset.kind,
      attempt: job.attempts,
    }),
  );
}

async function runOnce() {
  const item = (await rpc("claim", {})) as ClaimedJob | null;
  if (!item?.job || !item.asset) return false;
  try {
    await handle(item);
  } catch (error) {
    try {
      await rpc("fail", {
        job_id: item.job.id,
        lease_until: item.job.lease_until,
        attempt: item.job.attempts,
      });
    } catch {
      console.error(
        JSON.stringify({
          event: "media_job_failure_record_failed",
          job_id: item.job.id,
        }),
      );
    }
    const code = error instanceof Error ? error.message : "unknown";
    console.error(
      JSON.stringify({
        event: "media_job_failed",
        job_id: item.job.id,
        kind: item.asset.kind,
        attempt: item.job.attempts,
        code,
      }),
    );
  }
  return true;
}

async function reportCleanupCandidates() {
  const items = (await rpc("cleanup_candidates", {})) as Array<{ id: string }>;
  if (items.length)
    console.info(
      JSON.stringify({
        event: "media_cleanup_candidates",
        count: items.length,
        action: "quarantine_before_delete",
      }),
    );
}

type CleanupItem = {
  stage: "quarantined" | "skipped" | "restored" | "delete";
  id: string;
  site_id?: string;
  bucket?: string;
  preview?: { id: string; bucket: string } | null;
  lease_until?: string;
};

async function listStorageTree(
  bucket: string,
  directory: string,
): Promise<string[]> {
  const files: string[] = [];
  let offset = 0;
  while (true) {
    const { data, error } = await supabase.storage
      .from(bucket)
      .list(directory, {
        limit: 1000,
        offset,
        sortBy: { column: "name", order: "asc" },
      });
    if (error)
      throw new Error(`cleanup_storage_list_${error.statusCode ?? "failed"}`);
    if (!data.length) break;
    for (const item of data) {
      const path = `${directory}/${item.name}`;
      if (item.id === null)
        files.push(...(await listStorageTree(bucket, path)));
      else files.push(path);
    }
    offset += data.length;
    if (data.length < 1000) break;
  }
  return files;
}

async function removeAssetObjects(
  bucket: string,
  siteId: string,
  assetId: string,
) {
  const prefix = `${siteId}/${assetId}`;
  const files = await listStorageTree(bucket, prefix);
  for (let offset = 0; offset < files.length; offset += 1000) {
    const { error } = await supabase.storage
      .from(bucket)
      .remove(files.slice(offset, offset + 1000));
    if (error)
      throw new Error(`cleanup_storage_remove_${error.statusCode ?? "failed"}`);
  }
}

async function runCleanupOnce() {
  const item = (await rpc(
    "cleanup_claim",
    {},
    "travel_media_cleanup",
  )) as CleanupItem | null;
  if (!item) return false;
  if (item.stage !== "delete") {
    if (item.stage === "quarantined") {
      console.info(
        JSON.stringify({ event: "media_asset_quarantined", asset_id: item.id }),
      );
    }
    return true;
  }
  if (!item.site_id || !item.bucket || !item.lease_until)
    throw new Error("invalid_cleanup_claim");
  await removeAssetObjects(item.bucket, item.site_id, item.id);
  if (item.preview) {
    await removeAssetObjects(
      item.preview.bucket,
      item.site_id,
      item.preview.id,
    );
  }
  await rpc(
    "cleanup_finalize",
    {
      id: item.id,
      lease_until: item.lease_until,
    },
    "travel_media_cleanup",
  );
  console.info(
    JSON.stringify({
      event: "media_asset_cleanup_complete",
      asset_id: item.id,
    }),
  );
  return true;
}

async function reportQueueHealth() {
  const response = await request(`${base}/rest/v1/rpc/travel_queue_health`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  });
  const health = (await response.json()) as {
    queued: number;
    running: number;
    failed: number;
    expired_leases: number;
    oldest_queued_seconds: number;
  };
  if (health.queued || health.failed || health.expired_leases) {
    console.warn(JSON.stringify({ event: "media_queue_backlog", ...health }));
  }
}

const once = process.env.MEDIA_WORKER_ONCE === "1";
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
      await reportQueueHealth();
    }
    if (Date.now() - lastCleanupReport > 60 * 60 * 1000) {
      lastCleanupReport = Date.now();
      await reportCleanupCandidates();
    }
    const cleanupFound = await runCleanupOnce();
    const found = await runOnce();
    if (!once && !found && !cleanupFound) await sleep(5_000);
  } catch (error) {
    console.error(
      JSON.stringify({
        event: "media_worker_poll_failed",
        code: error instanceof Error ? error.message : "unknown",
      }),
    );
    if (!once) await sleep(15_000);
  }
} while (!once && !stopping);
