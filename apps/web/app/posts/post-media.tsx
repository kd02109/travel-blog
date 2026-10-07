"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { describeApiError } from "@repo/api-client";
import { createBrowserTravelApi } from "@repo/api-client/browser";
import { ApiErrorState } from "@repo/api-client/feedback";
import Image from "next/image";
import dynamic from "next/dynamic";

const PdfReader = dynamic(() => import("./pdf-reader"), {
  ssr: false,
  loading: () => (
    <div
      aria-label="PDF 문서를 불러오는 중"
      className="bg-muted/30 border-border my-6 flex min-h-[560px] items-center justify-center border p-6"
      role="status"
    >
      <div className="bg-background/70 aspect-[3/4] w-full max-w-[420px] animate-pulse p-8">
        <div className="bg-muted h-3 w-1/3" />
        <div className="bg-muted mt-12 h-7 w-3/4" />
        <div className="bg-muted mt-8 h-3 w-full" />
        <div className="bg-muted mt-3 h-3 w-5/6" />
        <div className="bg-muted mt-16 h-3 w-full" />
        <div className="bg-muted mt-3 h-3 w-4/5" />
      </div>
    </div>
  ),
});

export function PrivateImage({
  assetId,
  siteId,
  title,
  className,
  eager = false,
  allowRetry = true,
  reserveSpace = false,
}: {
  assetId: string;
  siteId: string;
  title: string;
  className?: string;
  eager?: boolean;
  allowRetry?: boolean;
  reserveSpace?: boolean;
}) {
  const api = useMemo(() => createBrowserTravelApi(), []);
  const [url, setUrl] = useState("");
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let disposed = false;
    let timer: ReturnType<typeof setTimeout>;
    const refresh = async () => {
      setLoading(true);
      try {
        const asset = await api.call("asset.access", {
          id: assetId,
          site_id: siteId,
        });
        if (disposed) return;
        setUrl(asset.url);
        setError(null);
        setLoading(false);
        timer = setTimeout(
          () => void refresh(),
          Math.max(30, asset.expires_in - 45) * 1000,
        );
      } catch (cause) {
        if (disposed) return;
        setError(cause ?? new Error("asset_access_failed"));
        setLoading(false);
      }
    };
    void refresh();
    return () => {
      disposed = true;
      clearTimeout(timer);
    };
  }, [api, assetId, siteId, retry]);
  const content = (
    <>
      {error != null && (
        <div
          className={
            reserveSpace
              ? "bg-surface/90 relative z-10 flex min-h-full items-center justify-center p-4"
              : undefined
          }
          onClick={
            allowRetry
              ? (event) => {
                  event.preventDefault();
                  event.stopPropagation();
                }
              : undefined
          }
        >
          <ApiErrorState
            error={error}
            title="사진을 불러오지 못했어요"
            onRetry={
              allowRetry ? () => setRetry((current) => current + 1) : undefined
            }
            isRetrying={loading}
          />
        </div>
      )}
      {url && (!reserveSpace || error == null) ? (
        <Image
          src={url}
          alt={title}
          width={1600}
          height={1200}
          unoptimized
          loading={eager ? "eager" : "lazy"}
          fetchPriority={eager ? "high" : undefined}
          className={
            className ??
            (reserveSpace
              ? "absolute inset-0 h-full w-full object-contain"
              : "h-auto max-h-[70vh] max-w-full rounded object-contain")
          }
        />
      ) : error == null ? (
        <p
          role="status"
          className={
            reserveSpace
              ? "text-muted-foreground flex h-full items-center justify-center text-sm"
              : undefined
          }
        >
          사진을 여는 중…
        </p>
      ) : null}
    </>
  );
  return reserveSpace ? (
    <div className="bg-muted/30 relative aspect-[3/2] max-h-[70vh] w-full overflow-auto rounded">
      {content}
    </div>
  ) : (
    content
  );
}

export function PdfCover({
  assetId,
  siteId,
  title,
  allowRetry = true,
}: {
  assetId: string;
  siteId: string;
  title: string;
  allowRetry?: boolean;
}) {
  const api = useMemo(() => createBrowserTravelApi(), []);
  const [previewAssetId, setPreviewAssetId] = useState<string | null>();
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    const refresh = async () => {
      setLoading(true);
      try {
        const asset = await api.call("asset.access", {
          id: assetId,
          site_id: siteId,
        });
        if (!active) return;
        setPreviewAssetId(asset.preview_asset_id);
        setError(null);
        setLoading(false);
      } catch (cause) {
        if (!active) return;
        setError(cause ?? new Error("asset_access_failed"));
        setLoading(false);
      }
    };
    void refresh();
    return () => {
      active = false;
    };
  }, [api, assetId, siteId, retry]);
  if (error != null)
    return (
      <div
        className="flex aspect-[3/2] items-center justify-center p-2"
        onClick={
          allowRetry
            ? (event) => {
                event.preventDefault();
                event.stopPropagation();
              }
            : undefined
        }
      >
        <ApiErrorState
          error={error}
          title="PDF 표지를 불러오지 못했어요"
          onRetry={
            allowRetry ? () => setRetry((current) => current + 1) : undefined
          }
          isRetrying={loading}
          className="w-full"
        />
      </div>
    );
  if (previewAssetId)
    return (
      <PrivateImage
        assetId={previewAssetId}
        siteId={siteId}
        title={`${title} 표지`}
        className="h-full max-h-none w-full rounded-none object-cover"
        allowRetry={allowRetry}
      />
    );
  return (
    <div
      className="bg-muted text-muted-foreground flex aspect-[3/2] flex-col items-center justify-center gap-2 px-4 text-center text-sm"
      role="status"
    >
      {previewAssetId === null
        ? "PDF 표지가 제공되지 않아요."
        : "PDF 표지를 여는 중…"}
    </div>
  );
}

export function PostAssetFigures({
  html,
  siteId,
}: {
  html: string;
  siteId: string;
}) {
  const api = useMemo(() => createBrowserTravelApi(), []);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let disposed = false;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const mounted: Array<{
      image: HTMLImageElement;
      errorMessage: HTMLParagraphElement;
      retryButton: HTMLButtonElement;
      onRetry: () => void;
    }> = [];
    const figures = [
      ...(root.current?.querySelectorAll<HTMLElement>(
        "figure[data-asset-id]",
      ) ?? []),
    ];
    for (const figure of figures) {
      const id = figure.dataset.assetId;
      if (!id) continue;
      const image = document.createElement("img");
      image.alt =
        figure.querySelector("figcaption")?.textContent?.trim() || "여행 사진";
      image.loading = "lazy";
      figure.prepend(image);
      const errorMessage = document.createElement("p");
      errorMessage.className = "m-3 text-sm text-destructive";
      errorMessage.setAttribute("role", "alert");
      errorMessage.hidden = true;
      figure.append(errorMessage);
      const retryButton = document.createElement("button");
      retryButton.type = "button";
      retryButton.className =
        "my-2 min-h-12 rounded border px-4 underline underline-offset-4";
      retryButton.textContent = "사진 다시 불러오기";
      retryButton.hidden = true;
      figure.append(retryButton);
      const refresh = async () => {
        retryButton.disabled = true;
        try {
          const asset = await api.call("asset.access", { id, site_id: siteId });
          if (disposed) return;
          image.src = asset.url;
          image.alt =
            figure.querySelector("figcaption")?.textContent?.trim() ||
            "여행 사진";
          errorMessage.hidden = true;
          retryButton.hidden = true;
          timers.push(
            setTimeout(
              () => void refresh(),
              Math.max(30, asset.expires_in - 45) * 1000,
            ),
          );
        } catch (cause) {
          if (disposed) return;
          const guidance = describeApiError(cause, "read");
          image.alt = guidance.title;
          errorMessage.textContent = `${guidance.title} ${guidance.description}`;
          errorMessage.hidden = false;
          retryButton.hidden = !guidance.canRetry;
          const waitMs = Math.max(0, (guidance.retryAt ?? 0) - Date.now());
          retryButton.disabled = waitMs > 0;
          if (waitMs > 0) {
            retryButton.textContent = `${Math.ceil(waitMs / 1000)}초 후 다시 시도`;
            timers.push(
              setTimeout(() => {
                if (disposed) return;
                retryButton.disabled = false;
                retryButton.textContent = "사진 다시 불러오기";
              }, waitMs),
            );
          } else {
            retryButton.textContent = "사진 다시 불러오기";
          }
        }
      };
      const onRetry = () => void refresh();
      retryButton.addEventListener("click", onRetry);
      mounted.push({ image, errorMessage, retryButton, onRetry });
      void refresh();
    }
    return () => {
      disposed = true;
      timers.forEach(clearTimeout);
      for (const { image, errorMessage, retryButton, onRetry } of mounted) {
        retryButton.removeEventListener("click", onRetry);
        image.remove();
        errorMessage.remove();
        retryButton.remove();
      }
    };
  }, [api, html, siteId]);
  return (
    <div
      ref={root}
      className="post-body-media"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

export function PrivatePdf({
  assetId,
  siteId,
  title,
}: {
  assetId: string;
  siteId: string;
  title: string;
}) {
  return (
    <PdfReader key={assetId} assetId={assetId} siteId={siteId} title={title} />
  );
}
