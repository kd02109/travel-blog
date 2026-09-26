"use client";
import { useMemo, useRef, useState } from "react";
import { createBrowserTravelApi } from "@repo/api-client/browser";
import { errorMessage, TravelApiError } from "@repo/api-client";
import { PrivateAssetView } from "./asset-view";

type MediaState = "uploading" | "processing" | "ready" | "failed" | "cancelled";
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
  show?: boolean;
};

function pause(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(new DOMException("취소됨", "AbortError"));
      },
      { once: true },
    );
  });
}

export function MediaUpload({
  siteId,
  onInsertImage,
  onSetCoverImage,
  onSelectPdf,
  kindFilter,
}: {
  siteId: string;
  onInsertImage?: (assetId: string, caption?: string) => void;
  onSetCoverImage?: (assetId: string) => void;
  onSelectPdf?: (assetId: string) => void;
  kindFilter?: "image" | "pdf";
}) {
  const api = useMemo(() => createBrowserTravelApi(), []);
  const [items, setItems] = useState<MediaItem[]>([]);
  const controllers = useRef(new Map<string, AbortController>());
  const patch = (id: string, value: Partial<MediaItem>) =>
    setItems((current) =>
      current.map((item) => (item.id === id ? { ...item, ...value } : item)),
    );

  async function process(item: MediaItem) {
    const controller = new AbortController();
    controllers.current.set(item.id, controller);
    patch(item.id, { state: "uploading", progress: 0, error: undefined });
    let assetId = item.assetId;
    try {
      if (!assetId || !item.uploaded) {
        const created = await api.call("asset.create", {
          site_id: siteId,
          kind: item.kind,
        });
        assetId = created.id;
        patch(item.id, { assetId });
        if (controller.signal.aborted) {
          await api.mutate("asset.cancel", { id: assetId, site_id: siteId });
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
      let result = await api.mutate("asset.complete", {
        id: assetId,
        site_id: siteId,
      });
      const deadline = Date.now() + 10 * 60 * 1000;
      while (result.state === "processing" && Date.now() < deadline) {
        await pause(2500, controller.signal);
        result = await api.mutate("asset.complete", {
          id: assetId,
          site_id: siteId,
        });
      }
      if (result.state !== "ready")
        throw new Error(
          result.state === "failed"
            ? "파일 처리에 실패했습니다. 다시 시도해 주세요."
            : "파일 처리가 오래 걸리고 있습니다. 다시 확인해 주세요.",
        );
      patch(item.id, { state: "ready", assetId, progress: 100 });
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        if (assetId)
          await api
            .mutate("asset.cancel", { id: assetId, site_id: siteId })
            .catch(() => undefined);
        patch(item.id, { state: "cancelled", error: undefined });
      } else {
        patch(item.id, {
          state: "failed",
          assetId,
          error:
            error instanceof TravelApiError
              ? errorMessage(error)
              : error instanceof Error
                ? error.message
                : "파일을 처리하지 못했습니다.",
        });
      }
    } finally {
      controllers.current.delete(item.id);
    }
  }

  async function cancel(item: MediaItem) {
    controllers.current.get(item.id)?.abort();
    if (!controllers.current.has(item.id) && item.assetId) {
      try {
        await api.mutate("asset.cancel", { id: item.assetId, site_id: siteId });
      } catch {
        patch(item.id, {
          error: "취소 요청을 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.",
        });
      }
      patch(item.id, { state: "cancelled" });
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

  return (
    <section
      className="space-y-4 rounded-lg border p-5"
      aria-label="사진과 PDF 파일"
    >
      <h2 className="text-lg font-semibold">사진과 PDF</h2>
      <div className="flex flex-wrap gap-3">
        {kindFilter !== "pdf" && <label className="cursor-pointer rounded border px-4 py-2">
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
        </label>}
        {kindFilter !== "image" && <label className="cursor-pointer rounded border px-4 py-2">
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
        </label>}
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
            <div className="flex flex-wrap gap-2">
              {item.state === "failed" && (
                <button
                  className="rounded border px-3 py-1"
                  onClick={() => void process(item)}
                >
                  다시 시도
                </button>
              )}
              {(item.state === "uploading" || item.state === "processing") && (
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
                  >
                    대표 사진으로 선택
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
    </section>
  );
}
