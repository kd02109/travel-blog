"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { createBrowserTravelApi } from "@repo/api-client/browser";
import { describeApiError } from "@repo/api-client";
import styles from "./post-cover.module.css";

type ImagePhase = "loading" | "ready" | "error";

export function PostCover({
  assetId,
  siteId,
  title,
  caption,
}: {
  assetId: string;
  siteId: string;
  title: string;
  caption?: string;
}) {
  const [url, setUrl] = useState("");
  const [phase, setPhase] = useState<ImagePhase>("loading");
  const [error, setError] = useState<unknown>(null);
  const [retry, setRetry] = useState(0);
  const [open, setOpen] = useState(false);
  const [zoom, setZoom] = useState<"fit" | "actual">("fit");
  const [modalPhase, setModalPhase] = useState<ImagePhase>("loading");
  const [modalUrl, setModalUrl] = useState("");
  const [modalError, setModalError] = useState<unknown>(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const loadedUrl = useRef("");
  const currentUrl = useRef("");
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const api = createBrowserTravelApi();
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
          const image = new window.Image();
          image.src = asset.url;
          await image.decode();
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
        }
        failures += 1;
        timer = setTimeout(
          () => void refresh(),
          Math.min(60, 5 * 2 ** Math.min(failures, 4)) * 1000,
        );
      }
    };

    void refresh();
    return () => {
      disposed = true;
      clearTimeout(timer);
    };
  }, [assetId, siteId, retry]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
      closeRef.current?.focus();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  const guidance = error == null ? null : describeApiError(error, "read");
  const retryCover = () => {
    setPhase("loading");
    setError(null);
    setUrl("");
    setRetry((current) => current + 1);
  };
  const retryModal = async () => {
    setModalPhase("loading");
    setModalError(null);
    setModalUrl("");
    try {
      const asset = await createBrowserTravelApi().call("asset.access", {
        id: assetId,
        site_id: siteId,
      });
      if (!dialogRef.current?.open) return;
      setModalUrl(asset.url);
    } catch (cause) {
      if (!dialogRef.current?.open) return;
      setModalError(cause ?? new Error("asset_access_failed"));
      setModalPhase("error");
    }
  };

  return (
    <>
      <figure className={styles.cover}>
        <div className={styles.stage}>
          {url && phase !== "error" && (
            <button
              ref={triggerRef}
              type="button"
              className={styles.photoTrigger}
              aria-label={`${title} 원본 사진 보기`}
              disabled={phase !== "ready"}
              onClick={() => {
                setZoom("fit");
                setModalUrl(url);
                setModalError(null);
                setModalPhase("loading");
                setOpen(true);
              }}
            >
              <Image
                src={url}
                alt={title}
                fill
                sizes="100vw"
                unoptimized
                preload
                loading="eager"
                className={styles.coverImage}
                onLoad={(event) => {
                  loadedUrl.current = url;
                  setDimensions({
                    width: event.currentTarget.naturalWidth,
                    height: event.currentTarget.naturalHeight,
                  });
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
              {phase === "ready" && (
                <span className={styles.openHint} aria-hidden="true">
                  <ExpandIcon /> 원본 보기
                </span>
              )}
            </button>
          )}
          {phase === "loading" && (
            <div className={styles.skeleton} role="status">
              <span className={styles.srOnly}>표지 사진을 불러오는 중</span>
            </div>
          )}
          {phase === "error" && (
            <div className={styles.error} role="alert">
              <div className={styles.errorContent}>
                <ImageErrorIcon />
                <strong>표지 사진을 불러오지 못했어요</strong>
                <p>{guidance?.description ?? "잠시 후 다시 시도해 주세요."}</p>
                {guidance?.canRetry !== false && (
                  <button type="button" onClick={retryCover}>
                    다시 시도
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
        {caption && (
          <figcaption className={styles.caption}>{caption}</figcaption>
        )}
      </figure>

      <dialog
        ref={dialogRef}
        className={styles.viewer}
        data-zoom={zoom}
        aria-label={`${title} 원본 사진`}
        onCancel={(event) => {
          event.preventDefault();
          setOpen(false);
        }}
        onClose={() => {
          setOpen(false);
          triggerRef.current?.focus();
        }}
        onClick={(event) => {
          if (event.target === event.currentTarget) setOpen(false);
        }}
      >
        <div className={styles.viewerBar}>
          <div className={styles.viewerHeading}>
            <strong>{title}</strong>
            {dimensions.width > 0 && dimensions.height > 0 && (
              <span>
                원본 {dimensions.width.toLocaleString()} ×{" "}
                {dimensions.height.toLocaleString()} px
              </span>
            )}
          </div>
          <div className={styles.viewerActions}>
            <button
              type="button"
              aria-pressed={zoom === "fit"}
              disabled={modalPhase !== "ready"}
              onClick={() => setZoom("fit")}
            >
              화면 맞춤
            </button>
            <button
              type="button"
              aria-pressed={zoom === "actual"}
              disabled={modalPhase !== "ready"}
              onClick={() => setZoom("actual")}
            >
              원본 100%
            </button>
            <button
              ref={closeRef}
              type="button"
              className={styles.close}
              aria-label="사진 닫기"
              onClick={() => setOpen(false)}
            >
              ×
            </button>
          </div>
        </div>
        <div className={styles.viewerCanvas} data-state={modalPhase}>
          {open && modalUrl && modalPhase !== "error" && (
            <Image
              src={modalUrl}
              alt={title}
              width={dimensions.width || 1600}
              height={dimensions.height || 1200}
              unoptimized
              className={styles.viewerImage}
              onLoad={(event) => {
                setDimensions({
                  width: event.currentTarget.naturalWidth,
                  height: event.currentTarget.naturalHeight,
                });
                setModalPhase("ready");
              }}
              onError={() => {
                setModalError(new Error("image_load_failed"));
                setModalPhase("error");
              }}
            />
          )}
          {modalPhase === "loading" && (
            <div className={styles.viewerSkeleton} role="status">
              <span className={styles.srOnly}>원본 사진을 불러오는 중</span>
            </div>
          )}
          {modalPhase === "error" && (
            <div className={styles.viewerError} role="alert">
              <ImageErrorIcon />
              <strong>원본 사진을 열지 못했어요</strong>
              <p>
                {modalError == null
                  ? "다시 시도하거나 사진을 닫아 주세요."
                  : describeApiError(modalError, "read").description}
              </p>
              {(modalError == null ||
                describeApiError(modalError, "read").canRetry) && (
                <button type="button" onClick={() => void retryModal()}>
                  다시 시도
                </button>
              )}
            </div>
          )}
        </div>
        {caption && <p className={styles.viewerCaption}>{caption}</p>}
      </dialog>
    </>
  );
}

function ExpandIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      aria-hidden="true"
    >
      <path d="M8 3H4v4m12-4h4v4M4 17v4h4m12-4v4h-4" />
    </svg>
  );
}

function ImageErrorIcon() {
  return (
    <svg
      width="36"
      height="36"
      viewBox="0 0 36 36"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      aria-hidden="true"
    >
      <rect x="4" y="7" width="28" height="22" rx="2" />
      <path d="m7 25 8-8 5 5 3-3 6 6M24 13h.01" />
    </svg>
  );
}
