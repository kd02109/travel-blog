"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { createBrowserTravelApi } from "@repo/api-client/browser";
import { TravelApiError } from "@repo/api-client";
import { ApiErrorState, ApiMutationError } from "@repo/api-client/feedback";
import type { ActionOutput } from "@repo/contracts";
import { Dialog } from "@repo/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/ui/select";
import { PrivateAssetView } from "./asset-view";
import {
  AssetStatusCheckError,
  completeAndPollAsset,
} from "../lib/asset-processing";

type MediaState =
  "uploading" | "processing" | "waiting" | "ready" | "failed" | "cancelled";
type MediaItem = {
  id: string;
  name: string;
  kind: "image" | "pdf";
  file: File;
  state: MediaState;
  progress: number;
  assetId?: string;
  uploaded?: boolean;
  error?: string;
  apiError?: unknown;
  show?: boolean;
};
type LibraryAsset = ActionOutput<"asset.list">["items"][number];
type LibraryState = {
  siteId: string;
  items: LibraryAsset[];
  nextOffset: number | null;
  isLoading: boolean;
  isLoadingMore: boolean;
  error?: unknown;
};
type LibraryFilter = "all" | "used" | "unused";
type LibrarySort = "recent" | "oldest" | "size";

const usageLabels: Record<string, string> = {
  home: "홈 표지",
  "post-cover": "대표 사진",
  "post-body": "본문",
  "pdf-preview": "PDF 미리보기",
};

function libraryAssetName(asset: LibraryAsset) {
  return `사진 ${asset.id.slice(0, 8)}`;
}

function formatAssetDate(value: string) {
  return new Intl.DateTimeFormat("ko-KR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function assetBytes(asset: LibraryAsset) {
  const bytes = asset.metadata.bytes;
  return typeof bytes === "number" ? bytes : undefined;
}

function formatBytes(bytes: number | undefined) {
  if (!bytes || bytes <= 0) return "크기 확인 중";
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function uniqueAssets(items: LibraryAsset[]) {
  return [...new Map(items.map((asset) => [asset.id, asset])).values()];
}

function libraryResult(
  siteId: string,
  result: ActionOutput<"asset.list">,
): LibraryState {
  return {
    siteId,
    items: uniqueAssets(result.items),
    nextOffset: result.next_offset,
    isLoading: false,
    isLoadingMore: false,
  };
}

/** Upload an editor-dropped image through the same asset lifecycle as the media panel. */
export async function uploadEditorImage(
  siteId: string,
  file: File,
): Promise<string> {
  const api = createBrowserTravelApi();
  const created = await api.call("asset.create", {
    site_id: siteId,
    kind: "image",
  });
  let completionSucceeded = false;
  try {
    await new Promise<void>((resolve, reject) => {
      const request = new XMLHttpRequest();
      request.open("PUT", created.upload_url);
      request.setRequestHeader("Content-Type", file.type);
      request.setRequestHeader("x-upsert", "false");
      request.onload = () =>
        request.status >= 200 && request.status < 300
          ? resolve()
          : reject(
              new Error(`이미지 업로드에 실패했습니다 (${request.status}).`),
            );
      request.onerror = () =>
        reject(new Error("네트워크 연결을 확인해 주세요."));
      request.send(file);
    });
    const state = await completeAndPollAsset(
      async () => {
        const state = (
          await api.mutate("asset.complete", {
            id: created.id,
            site_id: siteId,
          })
        ).state;
        completionSucceeded = true;
        return state;
      },
      async () =>
        (await api.call("asset.status", { id: created.id, site_id: siteId }))
          .state,
    );
    if (state !== "ready")
      throw new Error(
        state === "failed"
          ? "이미지 처리에 실패했습니다. 다시 시도해 주세요."
          : "이미지 처리가 지연되고 있습니다. 잠시 후 다시 업로드해 주세요.",
      );
    return created.id;
  } catch (error) {
    if (!completionSucceeded)
      await api
        .mutate("asset.cancel", { id: created.id, site_id: siteId })
        .catch(() => undefined);
    throw error;
  }
}

export function MediaUpload({
  siteId,
  onInsertImage,
  onSetCoverImage,
  onImageReady,
  onProcessingChange,
  onSelectPdf,
  kindFilter,
  coverActionLabel = "대표 사진으로 선택",
  coverActionDisabled = false,
}: {
  siteId: string;
  onInsertImage?: (assetId: string, caption?: string) => void;
  onSetCoverImage?: (assetId: string) => void;
  onImageReady?: (assetId: string) => void;
  onProcessingChange?: (processing: boolean) => void;
  onSelectPdf?: (assetId: string) => void;
  kindFilter?: "image" | "pdf";
  coverActionLabel?: string;
  coverActionDisabled?: boolean;
}) {
  const api = useMemo(() => createBrowserTravelApi(), []);
  const [items, setItems] = useState<MediaItem[]>([]);
  const [libraryFilter, setLibraryFilter] = useState<LibraryFilter>("all");
  const [librarySort, setLibrarySort] = useState<LibrarySort>("recent");
  const [libraryState, setLibraryState] = useState<LibraryState>({
    siteId,
    items: [],
    nextOffset: null,
    isLoading: true,
    isLoadingMore: false,
  });
  const [thumbnailState, setThumbnailState] = useState<{
    siteId: string;
    urls: Record<string, string>;
  }>({ siteId, urls: {} });
  const [previewSelection, setPreviewSelection] = useState<{
    siteId: string;
    asset: LibraryAsset;
  }>();
  const controllers = useRef(new Map<string, AbortController>());
  const libraryRequest = useRef(0);
  const renewingThumbnails = useRef(new Set<string>());
  const failedThumbnailUrls = useRef(new Map<string, string>());
  const thumbnailCooldown = useRef(new Set<string>());
  const thumbnailTimers = useRef(new Map<string, number>());
  const loadingMoreOffset = useRef<number | null>(null);
  const thumbnailUrls =
    thumbnailState.siteId === siteId ? thumbnailState.urls : {};
  const previewAsset =
    previewSelection?.siteId === siteId ? previewSelection.asset : undefined;
  const library = useMemo<LibraryState>(
    () =>
      libraryState.siteId === siteId
        ? libraryState
        : {
            siteId,
            items: [],
            nextOffset: null,
            isLoading: true,
            isLoadingMore: false,
          },
    [libraryState, siteId],
  );
  const visibleLibraryAssets = useMemo(() => {
    const source = library.items.filter((asset) => {
      if (libraryFilter === "used") return asset.usage.length > 0;
      if (libraryFilter === "unused") return asset.usage.length === 0;
      return true;
    });
    return [...source].sort((left, right) => {
      if (librarySort === "oldest") {
        return (
          left.created_at.localeCompare(right.created_at) ||
          left.id.localeCompare(right.id)
        );
      }
      if (librarySort === "size") {
        return (
          (assetBytes(right) ?? 0) - (assetBytes(left) ?? 0) ||
          right.created_at.localeCompare(left.created_at)
        );
      }
      return (
        right.created_at.localeCompare(left.created_at) ||
        left.id.localeCompare(right.id)
      );
    });
  }, [library.items, libraryFilter, librarySort]);
  useEffect(() => {
    if (kindFilter !== "image" || !siteId) return;
    const requestRef = libraryRequest;
    const request = ++requestRef.current;
    void api.call("asset.list", { site_id: siteId, limit: 24, offset: 0 }).then(
      (result) => {
        if (requestRef.current === request)
          setLibraryState(libraryResult(siteId, result));
      },
      (error: unknown) => {
        if (requestRef.current === request)
          setLibraryState({
            siteId,
            items: [],
            nextOffset: null,
            isLoading: false,
            isLoadingMore: false,
            error,
          });
      },
    );
    return () => {
      requestRef.current++;
    };
  }, [api, kindFilter, siteId]);
  function refreshLibrary() {
    if (kindFilter !== "image" || !siteId) return;
    const request = ++libraryRequest.current;
    setLibraryState({
      siteId,
      items: [],
      nextOffset: null,
      isLoading: true,
      isLoadingMore: false,
    });
    setThumbnailState({ siteId, urls: {} });
    failedThumbnailUrls.current.clear();
    thumbnailCooldown.current.clear();
    loadingMoreOffset.current = null;
    for (const timer of thumbnailTimers.current.values())
      window.clearTimeout(timer);
    thumbnailTimers.current.clear();
    void api.call("asset.list", { site_id: siteId, limit: 24, offset: 0 }).then(
      (result) => {
        if (libraryRequest.current === request)
          setLibraryState(libraryResult(siteId, result));
      },
      (error: unknown) => {
        if (libraryRequest.current === request)
          setLibraryState({
            siteId,
            items: [],
            nextOffset: null,
            isLoading: false,
            isLoadingMore: false,
            error,
          });
      },
    );
  }
  function loadMore() {
    const offset = library.nextOffset;
    if (
      kindFilter !== "image" ||
      !siteId ||
      offset === null ||
      library.isLoading ||
      library.isLoadingMore ||
      loadingMoreOffset.current === offset
    )
      return;
    loadingMoreOffset.current = offset;
    const request = libraryRequest.current;
    setLibraryState((current) => ({
      ...current,
      isLoadingMore: true,
      error: undefined,
    }));
    void api.call("asset.list", { site_id: siteId, limit: 24, offset }).then(
      (result) => {
        if (libraryRequest.current !== request) return;
        loadingMoreOffset.current = null;
        setLibraryState((current) => {
          if (current.siteId !== siteId || current.nextOffset !== offset)
            return current;
          return {
            siteId,
            items: uniqueAssets([...current.items, ...result.items]),
            nextOffset:
              result.next_offset !== null && result.next_offset > offset
                ? result.next_offset
                : null,
            isLoading: false,
            isLoadingMore: false,
          };
        });
      },
      (error: unknown) => {
        if (libraryRequest.current !== request) return;
        loadingMoreOffset.current = null;
        setLibraryState((current) =>
          current.siteId === siteId
            ? { ...current, isLoadingMore: false, error }
            : current,
        );
      },
    );
  }
  async function renewThumbnail(asset: LibraryAsset) {
    const currentUrl = thumbnailUrls[asset.id] ?? asset.thumbnail_url;
    const request = libraryRequest.current;
    if (
      renewingThumbnails.current.has(asset.id) ||
      failedThumbnailUrls.current.get(asset.id) === currentUrl ||
      thumbnailCooldown.current.has(asset.id)
    )
      return;
    renewingThumbnails.current.add(asset.id);
    failedThumbnailUrls.current.set(asset.id, currentUrl);
    thumbnailCooldown.current.add(asset.id);
    const previousTimer = thumbnailTimers.current.get(asset.id);
    if (previousTimer !== undefined) window.clearTimeout(previousTimer);
    thumbnailTimers.current.set(
      asset.id,
      window.setTimeout(() => {
        thumbnailCooldown.current.delete(asset.id);
        thumbnailTimers.current.delete(asset.id);
      }, 60000),
    );
    try {
      const access = await api.call("asset.access", {
        id: asset.id,
        site_id: siteId,
      });
      if (libraryRequest.current === request && access.url !== currentUrl) {
        setThumbnailState((current) => ({
          siteId,
          urls: {
            ...(current.siteId === siteId ? current.urls : {}),
            [asset.id]: access.url,
          },
        }));
      }
    } catch {
      // A manual refresh can retry a thumbnail whose access request failed.
    } finally {
      renewingThumbnails.current.delete(asset.id);
    }
  }
  useEffect(() => {
    onProcessingChange?.(
      items.some(
        (item) => item.state === "uploading" || item.state === "processing",
      ),
    );
  }, [items, onProcessingChange]);
  useEffect(() => {
    const active = controllers.current;
    const timers = thumbnailTimers.current;
    return () => {
      for (const controller of active.values()) controller.abort("unmount");
      for (const timer of timers.values()) window.clearTimeout(timer);
    };
  }, []);
  const patch = (id: string, value: Partial<MediaItem>) =>
    setItems((current) =>
      current.map((item) => (item.id === id ? { ...item, ...value } : item)),
    );

  async function process(item: MediaItem, statusOnly = false) {
    if (controllers.current.has(item.id)) return;
    const controller = new AbortController();
    controllers.current.set(item.id, controller);
    patch(item.id, {
      state: statusOnly ? "processing" : "uploading",
      progress: statusOnly ? 100 : 0,
      error: undefined,
      apiError: undefined,
    });
    let assetId = item.assetId;
    try {
      if (statusOnly) {
        if (!assetId) throw new Error("파일 정보를 찾지 못했습니다.");
        const state = (
          await api.call("asset.status", { id: assetId, site_id: siteId })
        ).state;
        if (controller.signal.aborted)
          throw new DOMException("취소됨", "AbortError");
        if (state === "ready") {
          patch(item.id, { state: "ready", progress: 100 });
          if (item.kind === "image") {
            onImageReady?.(assetId);
            refreshLibrary();
          }
        } else if (state === "failed")
          patch(item.id, {
            state: "failed",
            error: "파일 처리에 실패했습니다. 다시 시도해 주세요.",
          });
        else patch(item.id, { state: "waiting" });
        return;
      }
      if (!assetId || !item.uploaded) {
        const created = await api.call("asset.create", {
          site_id: siteId,
          kind: item.kind,
        });
        assetId = created.id;
        patch(item.id, { assetId });
        if (controller.signal.aborted) {
          throw new DOMException("취소됨", "AbortError");
        }
        await new Promise<void>((resolve, reject) => {
          const request = new XMLHttpRequest();
          request.open("PUT", created.upload_url);
          request.setRequestHeader("Content-Type", item.file.type);
          request.setRequestHeader("x-upsert", "false");
          request.upload.onprogress = (event) => {
            if (event.lengthComputable)
              patch(item.id, {
                progress: Math.min(
                  99,
                  Math.round((event.loaded / event.total) * 100),
                ),
              });
          };
          request.onload = () =>
            request.status >= 200 && request.status < 300
              ? resolve()
              : reject(
                  new Error(`파일 업로드에 실패했습니다 (${request.status}).`),
                );
          request.onerror = () =>
            reject(new Error("네트워크 연결을 확인해 주세요."));
          request.onabort = () =>
            reject(new DOMException("취소됨", "AbortError"));
          controller.signal.addEventListener("abort", () => request.abort(), {
            once: true,
          });
          request.send(item.file);
        });
        patch(item.id, { uploaded: true });
      }
      patch(item.id, { state: "processing", progress: 100 });
      const state = await completeAndPollAsset(
        async () =>
          (
            await api.mutate("asset.complete", {
              id: assetId!,
              site_id: siteId,
            })
          ).state,
        async () =>
          (await api.call("asset.status", { id: assetId!, site_id: siteId }))
            .state,
        { signal: controller.signal },
      );
      if (state === "processing") {
        patch(item.id, { state: "waiting", assetId, progress: 100 });
        return;
      }
      if (state !== "ready")
        throw new Error(
          state === "failed"
            ? "파일 처리에 실패했습니다. 다시 시도해 주세요."
            : "파일 상태를 확인하지 못했습니다. 다시 확인해 주세요.",
        );
      patch(item.id, { state: "ready", assetId, progress: 100 });
      if (item.kind === "image") {
        onImageReady?.(assetId);
        refreshLibrary();
      }
    } catch (error) {
      if (controller.signal.aborted && controller.signal.reason === "unmount")
        return;
      if (
        controller.signal.aborted ||
        (error instanceof DOMException && error.name === "AbortError")
      ) {
        if (assetId)
          await api
            .mutate("asset.cancel", { id: assetId, site_id: siteId })
            .catch(() => undefined);
        patch(item.id, { state: "cancelled", error: undefined });
      } else if (statusOnly || error instanceof AssetStatusCheckError) {
        patch(item.id, {
          state: "waiting",
          error: "처리 상태를 확인하지 못했습니다. 다시 확인해 주세요.",
        });
      } else {
        patch(item.id, {
          state: "failed",
          assetId,
          apiError: error instanceof TravelApiError ? error : undefined,
          error:
            error instanceof TravelApiError
              ? undefined
              : error instanceof Error
                ? error.message
                : "파일을 처리하지 못했습니다.",
        });
      }
    } finally {
      if (controllers.current.get(item.id) === controller)
        controllers.current.delete(item.id);
    }
  }

  async function cancel(item: MediaItem) {
    const controller = controllers.current.get(item.id);
    if (controller) {
      controller.abort();
      return;
    }
    if (item.assetId) {
      try {
        await api.mutate("asset.cancel", { id: item.assetId, site_id: siteId });
        patch(item.id, { state: "cancelled" });
      } catch {
        patch(item.id, {
          error: "취소 요청을 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.",
        });
      }
    }
  }

  function addFiles(files: FileList | null, kind: "image" | "pdf") {
    if (!files) return;
    for (const file of Array.from(files)) {
      const allowed =
        kind === "image"
          ? ["image/jpeg", "image/png", "image/webp"].includes(file.type)
          : file.type === "application/pdf";
      if (!allowed || file.size <= 0 || file.size > 20 * 1024 * 1024) {
        const item: MediaItem = {
          id: crypto.randomUUID(),
          name: file.name,
          kind,
          file,
          state: "failed",
          progress: 0,
          error:
            "이미지는 JPG, PNG, WebP, PDF는 20MB 이하 파일만 올릴 수 있습니다.",
        };
        setItems((current) => [item, ...current]);
        continue;
      }
      const item: MediaItem = {
        id: crypto.randomUUID(),
        name: file.name,
        kind,
        file,
        state: "uploading",
        progress: 0,
      };
      setItems((current) => [item, ...current]);
      void process(item);
    }
  }

  const imageUploadCard = (
    <label className="rounded-panel border-input bg-muted/30 hover:bg-muted flex min-h-56 cursor-pointer flex-col items-center justify-center gap-3 border-2 border-dashed p-5 text-center transition-colors">
      <span
        aria-hidden="true"
        className="bg-primary text-primary-foreground inline-flex size-12 items-center justify-center rounded-full text-2xl"
      >
        +
      </span>
      <span className="font-semibold">새 사진 올리기</span>
      <span className="text-muted-foreground text-sm">
        사진 선택
        <br />
        JPG, PNG, WebP · 20MB 이하
      </span>
      <input
        className="sr-only"
        type="file"
        accept="image/jpeg,image/png,image/webp"
        multiple
        onChange={(event) => {
          addFiles(event.currentTarget.files, "image");
          event.currentTarget.value = "";
        }}
      />
    </label>
  );

  return (
    <section
      className="space-y-4 rounded-lg border p-5"
      aria-label={kindFilter === "image" ? "사진 업로드" : "사진과 PDF 파일"}
    >
      <h2 className="text-lg font-semibold">
        {kindFilter === "image" ? "사진 업로드" : "사진과 PDF"}
      </h2>
      <div className="flex flex-wrap gap-3">
        {kindFilter !== "pdf" && kindFilter !== "image" && (
          <label className="cursor-pointer rounded border px-4 py-2">
            사진 올리기
            <input
              className="sr-only"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              multiple
              onChange={(event) => {
                addFiles(event.currentTarget.files, "image");
                event.currentTarget.value = "";
              }}
            />
          </label>
        )}
        {kindFilter !== "image" && (
          <label className="cursor-pointer rounded border px-4 py-2">
            PDF 올리기
            <input
              className="sr-only"
              type="file"
              accept="application/pdf"
              onChange={(event) => {
                addFiles(event.currentTarget.files, "pdf");
                event.currentTarget.value = "";
              }}
            />
          </label>
        )}
      </div>
      <ul className="space-y-4">
        {items.map((item) => (
          <li key={item.id} className="space-y-2 rounded-md bg-stone-50 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="truncate font-medium">{item.name}</span>
              <span role="status">
                {item.state === "uploading"
                  ? `업로드 ${item.progress}%`
                  : item.state === "processing"
                    ? "파일을 확인하고 표지를 만드는 중…"
                    : item.state === "waiting"
                      ? "파일 처리 대기 중"
                      : item.state === "ready"
                        ? "사용할 수 있어요"
                        : item.state === "cancelled"
                          ? "취소됨"
                          : "처리 실패"}
              </span>
            </div>
            {(item.state === "uploading" || item.state === "processing") && (
              <progress
                className="w-full"
                max={100}
                value={item.state === "processing" ? undefined : item.progress}
                aria-label={`${item.name} 업로드 진행률`}
              />
            )}
            {item.error && (
              <p role="alert" className="text-red-700">
                {item.error}
              </p>
            )}
            {item.apiError !== undefined && (
              <ApiMutationError
                error={item.apiError}
                onRetry={() => void process(item)}
              />
            )}
            <div className="flex flex-wrap gap-2">
              {item.state === "failed" && item.apiError === undefined && (
                <button
                  className="rounded border px-3 py-1"
                  onClick={() => void process(item)}
                >
                  다시 시도
                </button>
              )}
              {item.state === "waiting" && (
                <button
                  className="rounded border px-3 py-1"
                  onClick={() => void process(item, true)}
                >
                  상태 다시 확인
                </button>
              )}
              {(item.state === "uploading" ||
                item.state === "processing" ||
                item.state === "waiting") && (
                <button
                  className="rounded border px-3 py-1"
                  onClick={() => void cancel(item)}
                >
                  취소
                </button>
              )}
              {item.state === "ready" &&
                item.kind === "image" &&
                item.assetId &&
                onInsertImage && (
                  <button
                    className="rounded border px-3 py-1"
                    onClick={() => onInsertImage(item.assetId!, "")}
                  >
                    본문에 넣기
                  </button>
                )}
              {item.state === "ready" &&
                item.kind === "image" &&
                item.assetId &&
                onSetCoverImage && (
                  <button
                    className="rounded border px-3 py-1"
                    onClick={() => onSetCoverImage(item.assetId!)}
                    disabled={coverActionDisabled}
                  >
                    {coverActionLabel}
                  </button>
                )}
              {item.state === "ready" &&
                item.kind === "pdf" &&
                item.assetId &&
                onSelectPdf && (
                  <button
                    className="rounded border px-3 py-1"
                    onClick={() => onSelectPdf(item.assetId!)}
                  >
                    일정 PDF로 선택
                  </button>
                )}
              {item.state === "ready" && item.kind === "pdf" && (
                <button
                  className="rounded border px-3 py-1"
                  onClick={() => patch(item.id, { show: !item.show })}
                >
                  {item.show ? "PDF 닫기" : "PDF 보기"}
                </button>
              )}
            </div>
            {item.state === "ready" &&
              item.assetId &&
              item.kind === "image" && (
                <PrivateAssetView
                  assetId={item.assetId}
                  siteId={siteId}
                  kind="image"
                  title={item.name}
                />
              )}
            {item.show && item.assetId && (
              <PrivateAssetView
                assetId={item.assetId}
                siteId={siteId}
                kind="pdf"
                title={item.name}
              />
            )}
          </li>
        ))}
      </ul>
      {kindFilter === "image" && (
        <section
          aria-labelledby="media-library-heading"
          className="rounded-panel space-y-5 border bg-white p-5"
        >
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 id="media-library-heading" className="text-lg font-semibold">
                사진 보관함
              </h2>
              <p className="text-muted-foreground mt-1 text-sm">
                한 번 저장한 사진을 홈 표지와 글에 다시 사용할 수 있어요. 사진을
                누르면 원본을 확인합니다.
              </p>
            </div>
            <button
              type="button"
              className="rounded-control border px-4 py-2 text-sm"
              onClick={refreshLibrary}
              disabled={library.isLoading || library.isLoadingMore}
            >
              {library.isLoading ? "불러오는 중…" : "새로고침"}
            </button>
          </div>

          <div className="flex flex-wrap items-end justify-between gap-4">
            <div
              className="flex flex-wrap gap-2"
              role="group"
              aria-label="사진 보기"
            >
              {(
                [
                  ["all", "전체"],
                  ["used", "사용 중"],
                  ["unused", "아직 사용 안 함"],
                ] as const
              ).map(([value, label]) => (
                <button
                  type="button"
                  key={value}
                  aria-pressed={libraryFilter === value}
                  className="rounded-control aria-pressed:bg-primary aria-pressed:text-primary-foreground border px-3 py-2 text-sm"
                  onClick={() => setLibraryFilter(value)}
                >
                  {label}
                </button>
              ))}
            </div>
            <label className="block min-w-48 space-y-2 text-sm">
              <span>정렬</span>
              <Select
                value={librarySort}
                onValueChange={(value) => setLibrarySort(value as LibrarySort)}
              >
                <SelectTrigger aria-label="사진 정렬">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="recent">최근 업로드순</SelectItem>
                  <SelectItem value="oldest">오래된 순</SelectItem>
                  <SelectItem value="size">파일 크기순</SelectItem>
                </SelectContent>
              </Select>
            </label>
          </div>

          {library.error !== undefined && (
            <ApiErrorState
              error={library.error}
              title={
                library.items.length > 0
                  ? "다음 사진을 불러오지 못했어요"
                  : "사진 보관함을 불러오지 못했어요"
              }
              onRetry={library.items.length > 0 ? loadMore : refreshLibrary}
              isRetrying={library.isLoading || library.isLoadingMore}
            />
          )}
          {library.items.length === 0 && library.isLoading && (
            <p role="status" className="text-muted-foreground text-sm">
              저장된 사진을 불러오고 있어요…
            </p>
          )}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {imageUploadCard}
            {visibleLibraryAssets.map((asset) => (
              <article
                key={asset.id}
                className="rounded-panel min-w-0 overflow-hidden border bg-white"
              >
                <button
                  type="button"
                  className="group relative block aspect-[4/3] w-full overflow-hidden bg-stone-100 text-left"
                  onClick={() => setPreviewSelection({ siteId, asset })}
                  aria-label={`${libraryAssetName(asset)} 원본 확대`}
                >
                  <Image
                    src={thumbnailUrls[asset.id] ?? asset.thumbnail_url}
                    alt={libraryAssetName(asset)}
                    fill
                    unoptimized
                    sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 240px"
                    className="object-cover transition-transform duration-300 group-hover:scale-105"
                    onError={() => void renewThumbnail(asset)}
                  />
                  <span className="absolute inset-x-2 bottom-2 rounded bg-black/65 px-2 py-1 text-center text-xs text-white opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
                    원본 보기
                  </span>
                </button>
                <div className="space-y-3 p-3">
                  <div>
                    <p className="truncate font-medium">
                      {libraryAssetName(asset)}
                    </p>
                    <p className="text-muted-foreground text-xs">
                      {formatAssetDate(asset.created_at)} ·{" "}
                      {formatBytes(assetBytes(asset))}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-1" aria-label="사용 위치">
                    {asset.usage.length > 0 ? (
                      asset.usage.map((usage) => (
                        <span
                          key={usage}
                          className="rounded-full bg-stone-100 px-2 py-1 text-[11px]"
                        >
                          {usageLabels[usage] ?? usage}
                        </span>
                      ))
                    ) : (
                      <span className="text-muted-foreground text-xs">
                        아직 사용 안 함
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {onSetCoverImage && (
                      <button
                        type="button"
                        className="rounded-control border px-3 py-2 text-xs"
                        onClick={() => onSetCoverImage(asset.id)}
                        disabled={coverActionDisabled}
                      >
                        {coverActionLabel}
                      </button>
                    )}
                    {onInsertImage && (
                      <button
                        type="button"
                        className="rounded-control border px-3 py-2 text-xs"
                        onClick={() => onInsertImage(asset.id, "")}
                      >
                        본문에 넣기
                      </button>
                    )}
                  </div>
                </div>
              </article>
            ))}
          </div>
          {!library.isLoading &&
            !library.isLoadingMore &&
            library.error === undefined &&
            visibleLibraryAssets.length === 0 && (
              <p className="text-muted-foreground text-sm">
                {libraryFilter === "unused"
                  ? "현재 불러온 사진 중 아직 사용하지 않은 사진이 없습니다."
                  : libraryFilter === "used"
                    ? "현재 불러온 사진 중 사용 중인 사진이 없습니다."
                    : "저장된 사진이 없습니다. 첫 사진을 올려 보세요."}
              </p>
            )}
          {library.nextOffset !== null && !library.isLoading && (
            <div className="flex justify-center">
              <button
                type="button"
                className="rounded-control border px-5 py-2 text-sm"
                onClick={loadMore}
                disabled={library.isLoadingMore || library.error !== undefined}
              >
                {library.isLoadingMore ? "사진을 불러오는 중…" : "사진 더 보기"}
              </button>
            </div>
          )}
        </section>
      )}
      <Dialog
        open={Boolean(previewAsset)}
        onOpenChange={(open) => {
          if (!open) setPreviewSelection(undefined);
        }}
        title={previewAsset ? libraryAssetName(previewAsset) : "원본 미리보기"}
        description="Storage에서 새로 발급한 원본 URL을 사용합니다."
        className="w-[min(94vw,56rem)]"
      >
        {previewAsset && (
          <div className="space-y-4">
            <PrivateAssetView
              assetId={previewAsset.id}
              siteId={siteId}
              kind="image"
              title={libraryAssetName(previewAsset)}
              className="mx-auto h-auto max-h-[65vh] w-full max-w-full rounded object-contain"
            />
            <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
              <span className="text-muted-foreground">
                {formatAssetDate(previewAsset.created_at)} ·{" "}
                {formatBytes(assetBytes(previewAsset))}
              </span>
              <div className="flex flex-wrap gap-2">
                {onSetCoverImage && (
                  <button
                    type="button"
                    className="rounded-control border px-3 py-2"
                    onClick={() => onSetCoverImage(previewAsset.id)}
                    disabled={coverActionDisabled}
                  >
                    {coverActionLabel}
                  </button>
                )}
                {onInsertImage && (
                  <button
                    type="button"
                    className="rounded-control border px-3 py-2"
                    onClick={() => onInsertImage(previewAsset.id, "")}
                  >
                    본문에 넣기
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </Dialog>
    </section>
  );
}
