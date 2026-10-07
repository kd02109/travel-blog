"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { describeApiError } from "@repo/api-client";
import { createBrowserTravelApi } from "@repo/api-client/browser";
import Image from "next/image";
import dynamic from "next/dynamic";
import { PublicApiErrorState } from "../public-feedback";
import styles from "./post-media.module.css";

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

type PrivateImageProps = {
  assetId: string;
  siteId: string;
  title: string;
  className?: string;
  eager?: boolean;
  allowRetry?: boolean;
  reserveSpace?: boolean;
  compactError?: boolean;
};

export function PrivateImage(props: PrivateImageProps) {
  return (
    <PrivateImageForAsset key={`${props.siteId}:${props.assetId}`} {...props} />
  );
}

function PrivateImageForAsset({
  assetId,
  siteId,
  title,
  className,
  eager = false,
  allowRetry = true,
  reserveSpace = false,
  compactError = false,
}: PrivateImageProps) {
  const api = useMemo(() => createBrowserTravelApi(), []);
  const [url, setUrl] = useState("");
  const [error, setError] = useState<unknown>(null);
  const [phase, setPhase] = useState<"loading" | "ready" | "error">("loading");
  const [retry, setRetry] = useState(0);
  const loadedUrl = useRef("");
  const currentUrl = useRef("");
  useEffect(() => {
    let disposed = false;
    let timer: ReturnType<typeof setTimeout>;
    let failures = 0;
    const refresh = async () => {
      try {
        const asset = await api.call("asset.access", {
          id: assetId,
          site_id: siteId,
        });
        if (disposed) return;
        if (loadedUrl.current && asset.url !== currentUrl.current) {
          const nextImage = new window.Image();
          nextImage.src = asset.url;
          await nextImage.decode();
          if (disposed) return;
        }
        currentUrl.current = asset.url;
        setUrl(asset.url);
        setError(null);
        if (!loadedUrl.current) setPhase("loading");
        failures = 0;
        timer = setTimeout(
          () => void refresh(),
          Math.max(30, asset.expires_in - 45) * 1000,
        );
      } catch (cause) {
        if (disposed) return;
        if (!loadedUrl.current) {
          setError(cause ?? new Error("asset_access_failed"));
          setPhase("error");
        } else {
          failures += 1;
          timer = setTimeout(
            () => void refresh(),
            Math.min(60, 5 * 2 ** Math.min(failures, 4)) * 1000,
          );
        }
      }
    };
    void refresh();
    return () => {
      disposed = true;
      clearTimeout(timer);
    };
  }, [api, assetId, siteId, retry]);
  const retryImage = () => {
    loadedUrl.current = "";
    currentUrl.current = "";
    setUrl("");
    setError(null);
    setPhase("loading");
    setRetry((current) => current + 1);
  };
  return (
    <div
      className={`${styles.imageFrame} ${reserveSpace ? styles.reserveFrame : ""}`}
      data-state={phase}
    >
      {url && phase !== "error" && (
        <Image
          src={url}
          alt={title}
          width={1600}
          height={1200}
          unoptimized
          loading={eager ? "eager" : "lazy"}
          fetchPriority={eager ? "high" : undefined}
          className={`${className ?? "h-full w-full object-contain"} ${phase === "loading" ? styles.imagePending : ""}`}
          onLoad={() => {
            loadedUrl.current = url;
            setPhase("ready");
          }}
          onError={() => {
            if (loadedUrl.current && loadedUrl.current !== url) {
              currentUrl.current = loadedUrl.current;
              setUrl(loadedUrl.current);
              return;
            }
            setError(new Error("image_load_failed"));
            setPhase("error");
          }}
        />
      )}
      {phase === "loading" && (
        <div className={styles.imageSkeleton} role="status">
          <span className="sr-only">사진을 불러오는 중입니다.</span>
        </div>
      )}
      {phase === "error" && compactError && (
        <div
          className={styles.compactImageError}
          role="alert"
          aria-label="사진을 불러오지 못했어요"
        >
          <span aria-hidden="true">!</span>
        </div>
      )}
      {phase === "error" && !compactError && (
        <div
          className={styles.imageError}
          onClick={
            allowRetry
              ? (event) => {
                  event.preventDefault();
                  event.stopPropagation();
                }
              : undefined
          }
        >
          <PublicApiErrorState
            size="small"
            error={error}
            title="사진을 불러오지 못했어요"
            onRetry={allowRetry ? retryImage : undefined}
          />
        </div>
      )}
    </div>
  );
}

type PdfCoverProps = {
  assetId: string;
  siteId: string;
  title: string;
  allowRetry?: boolean;
};

export function PdfCover(props: PdfCoverProps) {
  return (
    <PdfCoverForAsset key={`${props.siteId}:${props.assetId}`} {...props} />
  );
}

function PdfCoverForAsset({
  assetId,
  siteId,
  title,
  allowRetry = true,
}: PdfCoverProps) {
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
        className={styles.pdfCover}
        onClick={
          allowRetry
            ? (event) => {
                event.preventDefault();
                event.stopPropagation();
              }
            : undefined
        }
      >
        <PublicApiErrorState
          size="small"
          error={error}
          title="PDF 표지를 불러오지 못했어요"
          onRetry={
            allowRetry
              ? () => {
                  setError(null);
                  setPreviewAssetId(undefined);
                  setRetry((current) => current + 1);
                }
              : undefined
          }
          isRetrying={loading}
        />
      </div>
    );
  if (previewAssetId)
    return (
      <div className={styles.pdfCover}>
        <PrivateImage
          assetId={previewAssetId}
          siteId={siteId}
          title={`${title} 표지`}
          className="h-full max-h-none w-full rounded-none object-cover"
          allowRetry={allowRetry}
        />
      </div>
    );
  return (
    <div
      className={styles.pdfCover}
      role={previewAssetId === undefined ? "status" : undefined}
    >
      {previewAssetId === null ? (
        <p className={styles.pdfUnavailable}>PDF 표지가 제공되지 않아요.</p>
      ) : (
        <>
          <span className="sr-only">PDF 표지를 불러오는 중입니다.</span>
          <span className={styles.imageSkeleton} aria-hidden="true" />
        </>
      )}
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
      frame: HTMLDivElement;
      image: HTMLImageElement;
      onLoad: () => void;
      onError: () => void;
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
      const frame = document.createElement("div");
      frame.className = styles.figureFrame ?? "";
      frame.dataset.state = "loading";
      frame.setAttribute("role", "status");
      frame.setAttribute("aria-label", "사진을 불러오는 중");
      const image = document.createElement("img");
      image.alt =
        figure.querySelector("figcaption")?.textContent?.trim() || "여행 사진";
      image.loading = "lazy";
      frame.append(image);
      const skeleton = document.createElement("span");
      skeleton.className = styles.figureSkeleton ?? "";
      skeleton.setAttribute("aria-hidden", "true");
      frame.append(skeleton);
      const errorMessage = document.createElement("div");
      errorMessage.className = styles.figureError ?? "";
      errorMessage.setAttribute("role", "alert");
      errorMessage.hidden = true;
      const errorTitle = document.createElement("strong");
      errorTitle.textContent = "사진을 불러오지 못했어요";
      const errorDescription = document.createElement("p");
      errorMessage.append(errorTitle, errorDescription);
      const retryButton = document.createElement("button");
      retryButton.type = "button";
      retryButton.className = styles.figureRetry ?? "";
      retryButton.textContent = "사진 다시 불러오기";
      errorMessage.append(retryButton);
      frame.append(errorMessage);
      figure.prepend(frame);
      let loadedUrl = "";
      let currentUrl = "";
      let expiryTimer: ReturnType<typeof setTimeout> | undefined;
      let failures = 0;
      const setLoading = () => {
        if (loadedUrl) return;
        frame.dataset.state = "loading";
        frame.setAttribute("role", "status");
        frame.setAttribute("aria-label", "사진을 불러오는 중");
        skeleton.hidden = false;
        errorMessage.hidden = true;
      };
      const showError = (cause: unknown) => {
        const guidance = describeApiError(cause, "read");
        frame.dataset.state = "error";
        frame.removeAttribute("role");
        frame.removeAttribute("aria-label");
        skeleton.hidden = true;
        errorDescription.textContent = guidance.description;
        errorMessage.hidden = false;
        retryButton.hidden = !guidance.canRetry;
        const waitMs = Math.max(0, (guidance.retryAt ?? 0) - Date.now());
        retryButton.disabled = waitMs > 0;
        retryButton.textContent =
          waitMs > 0
            ? `${Math.ceil(waitMs / 1000)}초 후 다시 시도`
            : "사진 다시 불러오기";
        if (waitMs > 0) {
          timers.push(
            setTimeout(() => {
              if (disposed) return;
              retryButton.disabled = false;
              retryButton.textContent = "사진 다시 불러오기";
            }, waitMs),
          );
        }
      };
      const onLoad = () => {
        loadedUrl = image.src;
        frame.dataset.state = "ready";
        frame.removeAttribute("role");
        frame.removeAttribute("aria-label");
        skeleton.hidden = true;
        errorMessage.hidden = true;
      };
      const onError = () => {
        if (loadedUrl && loadedUrl !== image.src) {
          image.src = loadedUrl;
          return;
        }
        showError(new Error("image_load_failed"));
      };
      image.addEventListener("load", onLoad);
      image.addEventListener("error", onError);
      const refresh = async () => {
        clearTimeout(expiryTimer);
        retryButton.disabled = true;
        setLoading();
        try {
          const asset = await api.call("asset.access", { id, site_id: siteId });
          if (disposed) return;
          if (loadedUrl && asset.url !== currentUrl) {
            const nextImage = new window.Image();
            nextImage.src = asset.url;
            await nextImage.decode();
            if (disposed) return;
          }
          currentUrl = asset.url;
          image.src = asset.url;
          image.alt =
            figure.querySelector("figcaption")?.textContent?.trim() ||
            "여행 사진";
          failures = 0;
          expiryTimer = setTimeout(
            () => void refresh(),
            Math.max(30, asset.expires_in - 45) * 1000,
          );
          timers.push(expiryTimer);
        } catch (cause) {
          if (disposed) return;
          if (loadedUrl) {
            failures += 1;
            expiryTimer = setTimeout(
              () => void refresh(),
              Math.min(60, 5 * 2 ** Math.min(failures, 4)) * 1000,
            );
            timers.push(expiryTimer);
          } else {
            showError(cause);
          }
        }
      };
      const onRetry = () => void refresh();
      retryButton.addEventListener("click", onRetry);
      mounted.push({ frame, image, onLoad, onError, retryButton, onRetry });
      void refresh();
    }
    return () => {
      disposed = true;
      timers.forEach(clearTimeout);
      for (const {
        frame,
        image,
        onLoad,
        onError,
        retryButton,
        onRetry,
      } of mounted) {
        image.removeEventListener("load", onLoad);
        image.removeEventListener("error", onError);
        retryButton.removeEventListener("click", onRetry);
        frame.remove();
      }
    };
  }, [api, html, siteId]);
  return (
    <div
      ref={root}
      className={`post-body-media ${styles.assetFigures}`}
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
