import { afterEach, describe, expect, it, vi } from "vitest";

const runTick = vi.hoisted(() => vi.fn());

vi.mock("@repo/media-worker/processor", () => ({
  createMediaWorkerFromEnv: () => ({ runTick }),
}));

import { GET, HEAD } from "../app/api/internal/media-worker/route";

const secret = "0123456789abcdef0123456789abcdef";
const url = "https://admin.example.test/api/internal/media-worker";

function request(authorization?: string) {
  return new Request(url, {
    headers: authorization ? { authorization } : undefined,
  });
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("media worker cron route", () => {
  it("rejects missing or invalid cron credentials before running a job", async () => {
    vi.stubEnv("CRON_SECRET", secret);
    vi.stubEnv("TRAVEL_MEDIA_WORKER_ENABLED", "true");

    for (const authorization of [undefined, "Bearer wrong", secret]) {
      const response = await GET(request(authorization));
      expect(response.status).toBe(401);
      expect(response.headers.get("cache-control")).toBe("no-store");
      expect(await response.text()).toBe("");
    }
    expect(runTick).not.toHaveBeenCalled();
  });

  it("fails closed without a sufficiently long secret or the enable flag", async () => {
    vi.stubEnv("CRON_SECRET", "short");
    vi.stubEnv("TRAVEL_MEDIA_WORKER_ENABLED", "true");
    expect((await GET(request("Bearer short"))).status).toBe(401);

    vi.stubEnv("CRON_SECRET", secret);
    vi.stubEnv("TRAVEL_MEDIA_WORKER_ENABLED", "false");
    expect((await GET(request(`Bearer ${secret}`))).status).toBe(503);
    expect(runTick).not.toHaveBeenCalled();
  });

  it("runs exactly one worker tick with valid credentials", async () => {
    vi.stubEnv("CRON_SECRET", secret);
    vi.stubEnv("TRAVEL_MEDIA_WORKER_ENABLED", "true");
    runTick.mockResolvedValue({ kind: "asset", result: "processed" });

    const response = await GET(request(`Bearer ${secret}`));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      kind: "asset",
      result: "processed",
    });
    expect(runTick).toHaveBeenCalledTimes(1);
  });

  it("returns a retryable failure without exposing error details", async () => {
    vi.stubEnv("CRON_SECRET", secret);
    vi.stubEnv("TRAVEL_MEDIA_WORKER_ENABLED", "true");
    runTick.mockRejectedValue(new Error("sensitive-storage-detail"));

    const response = await GET(request(`Bearer ${secret}`));
    expect(response.status).toBe(503);
    expect(await response.text()).toBe("");
  });

  it("does not execute a job for HEAD probes", () => {
    expect(HEAD().status).toBe(405);
    expect(runTick).not.toHaveBeenCalled();
  });
});
