import type { ActionOutput } from "@repo/contracts";

type AssetState = ActionOutput<"asset.status">["state"];

export class AssetStatusCheckError extends Error {
  constructor(public readonly cause: unknown) {
    super("asset_status_check_failed");
    this.name = "AssetStatusCheckError";
  }
}

const PANEL_DELAYS_MS = [5_000, 10_000, 20_000, 30_000, 60_000] as const;

function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) throw new DOMException("취소됨", "AbortError");
}

function pause(ms: number, signal?: AbortSignal): Promise<void> {
  throwIfAborted(signal);
  return new Promise((resolve, reject) => {
    const onAbort = () => {
      clearTimeout(timer);
      reject(new DOMException("취소됨", "AbortError"));
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

export async function pollAssetStatus(
  initialState: AssetState,
  check: () => Promise<AssetState>,
  options: { delaysMs?: readonly number[]; signal?: AbortSignal } = {},
): Promise<AssetState> {
  const { delaysMs = PANEL_DELAYS_MS, signal } = options;
  let state = initialState;
  for (const delay of delaysMs) {
    if (state !== "processing") break;
    await pause(delay, signal);
    throwIfAborted(signal);
    try {
      state = await check();
    } catch (error) {
      throwIfAborted(signal);
      throw new AssetStatusCheckError(error);
    }
    throwIfAborted(signal);
  }
  return state;
}

export async function completeAndPollAsset(
  complete: () => Promise<AssetState>,
  check: () => Promise<AssetState>,
  options: { delaysMs?: readonly number[]; signal?: AbortSignal } = {},
): Promise<AssetState> {
  throwIfAborted(options.signal);
  const state = await complete();
  throwIfAborted(options.signal);
  return pollAssetStatus(state, check, options);
}
