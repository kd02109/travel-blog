import { createHash } from "node:crypto";
import sharp from "sharp";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createMediaWorker } from "./processor.ts";

const base = "https://example.supabase.co";
const serviceKey = "sb_secret_test";
const lease = "2026-10-08T10:05:00.000Z";
const claim = {
  job: {
    id: "job-1",
    lease_until: lease,
    attempts: 2,
    type: "process_asset",
  },
  asset: {
    id: "asset-1",
    site_id: "site-1",
    kind: "image",
    bucket: "originals-private",
    object_path: "site-1/asset-1/original.png",
    state: "processing",
  },
};

function json(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function actionOf(init?: RequestInit) {
  return JSON.parse(String(init?.body)) as {
    p_action: string;
    p_input: Record<string, unknown>;
  };
}

afterEach(() => vi.restoreAllMocks());

describe("one-shot media worker", () => {
  it("checks the asset queue once, then cleanup once when both are idle", async () => {
    const fetchImplementation = vi.fn<typeof fetch>(async (input, init) => {
      const url = String(input);
      if (url.endsWith("/rest/v1/rpc/travel_worker")) {
        expect(actionOf(init)).toEqual({ p_action: "claim", p_input: {} });
        return json(null);
      }
      if (url.endsWith("/rest/v1/rpc/travel_media_cleanup")) {
        expect(actionOf(init)).toEqual({
          p_action: "cleanup_claim",
          p_input: {},
        });
        return json(null);
      }
      throw new Error(`unexpected request: ${url}`);
    });

    const worker = createMediaWorker({
      supabaseUrl: base,
      serviceKey,
      fetchImplementation,
    });

    await expect(worker.runTick()).resolves.toEqual({
      kind: "cleanup",
      result: "idle",
    });
    expect(fetchImplementation).toHaveBeenCalledTimes(2);
    expect(fetchImplementation.mock.calls.map(([url]) => String(url))).toEqual([
      `${base}/rest/v1/rpc/travel_worker`,
      `${base}/rest/v1/rpc/travel_media_cleanup`,
    ]);
  });

  it("records an asset failure with the exact claim proof and stops the tick", async () => {
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
    const actions: ReturnType<typeof actionOf>[] = [];
    const fetchImplementation = vi.fn<typeof fetch>(async (input, init) => {
      const url = String(input);
      if (url.endsWith("/rest/v1/rpc/travel_worker")) {
        const action = actionOf(init);
        actions.push(action);
        return json(action.p_action === "claim" ? claim : { ok: true });
      }
      if (url.includes("/storage/v1/object/authenticated/")) {
        return json({ message: "download failed" }, 500);
      }
      throw new Error(`unexpected request: ${url}`);
    });

    const worker = createMediaWorker({
      supabaseUrl: base,
      serviceKey,
      fetchImplementation,
    });

    await expect(worker.runTick()).resolves.toEqual({
      kind: "asset",
      result: "failed",
    });
    expect(actions).toEqual([
      { p_action: "claim", p_input: {} },
      {
        p_action: "fail",
        p_input: {
          job_id: claim.job.id,
          lease_until: lease,
          attempt: 2,
        },
      },
    ]);
    expect(fetchImplementation).toHaveBeenCalledTimes(3);
    expect(errorLog.mock.calls.flat().join(" ")).toContain("remote_500");
  });

  it("uploads an image and completes exactly one asset per tick", async () => {
    vi.spyOn(console, "info").mockImplementation(() => {});
    const source = await sharp({
      create: {
        width: 2,
        height: 1,
        channels: 4,
        background: "#e75b3c",
      },
    })
      .png()
      .toBuffer();
    const actions: ReturnType<typeof actionOf>[] = [];
    let uploaded: Buffer | undefined;
    const fetchImplementation = vi.fn<typeof fetch>(async (input, init) => {
      const url = String(input);
      if (url.endsWith("/rest/v1/rpc/travel_worker")) {
        const action = actionOf(init);
        actions.push(action);
        return json(action.p_action === "claim" ? claim : { ok: true });
      }
      if (
        url.endsWith(
          "/storage/v1/object/authenticated/originals-private/site-1/asset-1/original.png",
        )
      ) {
        return new Response(new Uint8Array(source), { status: 200 });
      }
      if (
        url.endsWith(
          "/storage/v1/object/originals-private/site-1/asset-1/attempt-2/processed.jpg",
        )
      ) {
        expect(init?.method).toBe("POST");
        expect(new Headers(init?.headers).get("Content-Type")).toBe(
          "image/jpeg",
        );
        uploaded = Buffer.from(init?.body as Buffer);
        return json({ Key: claim.asset.object_path });
      }
      throw new Error(`unexpected request: ${url}`);
    });

    const worker = createMediaWorker({
      supabaseUrl: base,
      serviceKey,
      fetchImplementation,
    });

    await expect(worker.runTick()).resolves.toEqual({
      kind: "asset",
      result: "processed",
    });
    expect(fetchImplementation).toHaveBeenCalledTimes(4);
    expect(uploaded?.subarray(0, 3)).toEqual(Buffer.from([0xff, 0xd8, 0xff]));
    expect(actions).toEqual([
      { p_action: "claim", p_input: {} },
      {
        p_action: "complete",
        p_input: {
          job_id: claim.job.id,
          lease_until: lease,
          attempt: 2,
          object_path: "site-1/asset-1/attempt-2/processed.jpg",
          metadata: {
            mime: "image/jpeg",
            bytes: uploaded?.byteLength,
            checksum: createHash("sha256").update(uploaded!).digest("hex"),
            width: 2,
            height: 1,
          },
        },
      },
    ]);
  });
});
