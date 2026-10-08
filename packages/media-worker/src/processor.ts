import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";
import { processPdf } from "./pdf.ts";
import { createWorkerFetch, workerApiKeyHeaders } from "./request-auth.ts";

const MAX_BYTES = 20 * 1024 * 1024;
const MAX_PIXELS = 40_000_000;
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

export type MediaWorkerConfig = {
  supabaseUrl: string;
  serviceKey: string;
  fetchImplementation?: typeof fetch;
};

/** No polling, process listeners or environment reads run when this module loads. */
export function createMediaWorker(config: MediaWorkerConfig) {
  const base = config.supabaseUrl.replace(/\/$/, "");
  const key = config.serviceKey;
  if (!/^https?:\/\/[^/]+$/.test(base) || !key)
    throw new Error("SUPABASE_URL and worker service key are required");
  const fetchImplementation = config.fetchImplementation ?? fetch;
  const headers = workerApiKeyHeaders(key);
  const workerFetch = createWorkerFetch(key, fetchImplementation);
  const supabase = createClient(base, key, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { fetch: workerFetch },
  });

  async function request(url: string, init: RequestInit = {}) {
    const response = await fetchImplementation(url, {
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
      const result = await processPdf(source);
      const documentPath = `${prefix}/document.pdf`;
      const previewPath = `${prefix}/first-page.png`;
      await upload(asset.bucket, documentPath, source, "application/pdf");
      await upload(
        "documents-private",
        previewPath,
        result.preview,
        "image/png",
      );
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

  async function processAssetOnce(): Promise<"idle" | "processed" | "failed"> {
    const item = (await rpc("claim", {})) as ClaimedJob | null;
    if (!item) return "idle";
    if (!item.job) throw new Error("invalid_asset_claim");
    try {
      if (item.job.type !== "process_asset" || !item.asset)
        throw new Error("invalid_asset_claim");
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
      const message = error instanceof Error ? error.message : "";
      const code = /^[a-z][a-z0-9_]{0,63}$/.test(message)
        ? message
        : "processing_error";
      console.error(
        JSON.stringify({
          event: "media_job_failed",
          job_id: item.job.id,
          kind: item.asset?.kind ?? "unknown",
          attempt: item.job.attempts,
          code,
        }),
      );
      return "failed";
    }
    return "processed";
  }

  async function reportCleanupCandidates() {
    const items = (await rpc("cleanup_candidates", {})) as Array<{
      id: string;
    }>;
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
    stage: "quarantined" | "skipped" | "restored" | "blocked" | "delete";
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
        throw new Error(
          `cleanup_storage_remove_${error.statusCode ?? "failed"}`,
        );
    }
  }

  async function processCleanupOnce(): Promise<
    "idle" | "quarantined" | "deleted" | "skipped" | "restored" | "blocked"
  > {
    const item = (await rpc(
      "cleanup_claim",
      {},
      "travel_media_cleanup",
    )) as CleanupItem | null;
    if (!item) return "idle";
    if (item.stage !== "delete") {
      if (item.stage === "quarantined") {
        console.info(
          JSON.stringify({
            event: "media_asset_quarantined",
            asset_id: item.id,
          }),
        );
      }
      return item.stage;
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
    return "deleted";
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

  async function runTick() {
    // A serverless invocation claims at most one DB job. Asset readiness takes
    // precedence; cleanup is attempted only when the processing queue is idle.
    const asset = await processAssetOnce();
    if (asset !== "idle") return { kind: "asset" as const, result: asset };
    const cleanup = await processCleanupOnce();
    return { kind: "cleanup" as const, result: cleanup };
  }

  return {
    processAssetOnce,
    processCleanupOnce,
    reportCleanupCandidates,
    reportQueueHealth,
    runTick,
  };
}

export function createMediaWorkerFromEnv(
  environment: NodeJS.ProcessEnv = process.env,
) {
  return createMediaWorker({
    supabaseUrl: environment.SUPABASE_URL ?? "",
    serviceKey: environment.SUPABASE_SERVICE_ROLE_KEY ?? "",
  });
}
