import { afterEach, expect, it, vi } from "vitest";
import {
  AssetStatusCheckError,
  completeAndPollAsset,
  pollAssetStatus,
} from "./asset-processing";

afterEach(() => {
  vi.useRealTimers();
});

it("checks processing assets with increasing delays and stops when ready", async () => {
  vi.useFakeTimers();
  const status = vi
    .fn<() => Promise<"processing" | "ready">>()
    .mockResolvedValueOnce("processing")
    .mockResolvedValueOnce("ready");

  const result = pollAssetStatus("processing", status, {
    delaysMs: [5000, 10000, 20000],
  });
  await vi.advanceTimersByTimeAsync(4999);
  expect(status).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(1);
  expect(status).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(9999);
  expect(status).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(1);
  expect(await result).toBe("ready");
  await vi.advanceTimersByTimeAsync(20000);
  expect(status).toHaveBeenCalledTimes(2);
});

it("stops automatic checks after the bounded schedule", async () => {
  vi.useFakeTimers();
  const status = vi.fn(async () => "processing" as const);
  const result = pollAssetStatus("processing", status);

  await vi.runAllTimersAsync();
  expect(await result).toBe("processing");
  expect(status).toHaveBeenCalledTimes(5);
  await vi.advanceTimersByTimeAsync(60 * 60 * 1000);
  expect(status).toHaveBeenCalledTimes(5);
});

it("does not accept a late ready response after cancellation", async () => {
  vi.useFakeTimers();
  const controller = new AbortController();
  let finishStatus!: (state: "ready") => void;
  const status = vi.fn(
    () =>
      new Promise<"ready">((resolve) => {
        finishStatus = resolve;
      }),
  );
  const result = pollAssetStatus("processing", status, {
    delaysMs: [5000],
    signal: controller.signal,
  });

  await vi.advanceTimersByTimeAsync(5000);
  controller.abort();
  finishStatus("ready");
  await expect(result).rejects.toMatchObject({ name: "AbortError" });
});

it("completes the upload once and uses status checks for subsequent reads", async () => {
  vi.useFakeTimers();
  const complete = vi.fn(async () => "processing" as const);
  const status = vi.fn(async () => "ready" as const);

  const result = completeAndPollAsset(complete, status, {
    delaysMs: [5000],
  });
  await vi.advanceTimersByTimeAsync(5000);

  expect(await result).toBe("ready");
  expect(complete).toHaveBeenCalledTimes(1);
  expect(status).toHaveBeenCalledTimes(1);
});

it("distinguishes an unavailable status check from a failed asset", async () => {
  vi.useFakeTimers();
  const status = vi.fn(async () => {
    throw new Error("network unavailable");
  });
  const result = pollAssetStatus("processing", status, {
    delaysMs: [5000, 10000],
  });
  const outcome = result.catch((error: unknown) => error);

  await vi.advanceTimersByTimeAsync(5000);
  expect(await outcome).toBeInstanceOf(AssetStatusCheckError);
  expect(status).toHaveBeenCalledTimes(1);
});

it("does not send completion after cancellation", async () => {
  const controller = new AbortController();
  controller.abort();
  const complete = vi.fn(async () => "processing" as const);

  await expect(
    completeAndPollAsset(complete, async () => "ready", {
      signal: controller.signal,
    }),
  ).rejects.toMatchObject({ name: "AbortError" });
  expect(complete).not.toHaveBeenCalled();
});
