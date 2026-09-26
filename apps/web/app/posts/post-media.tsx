"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { createBrowserTravelApi } from "@repo/api-client/browser";
import Image from "next/image";

export function PrivateImage({
  assetId,
  siteId,
  title,
}: {
  assetId: string;
  siteId: string;
  title: string;
}) {
  const api = useMemo(() => createBrowserTravelApi(), []);
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    let disposed = false;
    let timer: ReturnType<typeof setTimeout>;
    const refresh = async () => {
      try {
        const asset = await api.call("asset.access", {
          id: assetId,
          site_id: siteId,
        });
        if (disposed) return;
        setUrl(asset.url);
        setError("");
        timer = setTimeout(
          () => void refresh(),
          Math.max(30, asset.expires_in - 45) * 1000,
        );
      } catch {
        if (!disposed) setError("사진을 불러오지 못했습니다.");
      }
    };
    void refresh();
    return () => {
      disposed = true;
      clearTimeout(timer);
    };
  }, [api, assetId, siteId]);
  return error ? (
    <p role="alert">{error}</p>
  ) : url ? (
    <Image
      src={url}
      alt={title}
      width={1600}
      height={1200}
      unoptimized
      className="h-auto max-h-[70vh] max-w-full rounded object-contain"
    />
  ) : (
    <p role="status">사진을 여는 중…</p>
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
        figure.querySelector("figcaption")?.textContent ?? "여행 사진";
      image.loading = "lazy";
      image.className =
        "mx-auto my-4 max-h-[70vh] max-w-full rounded object-contain";
      figure.prepend(image);
      const refresh = async () => {
        try {
          const asset = await api.call("asset.access", { id, site_id: siteId });
          if (disposed) return;
          image.src = asset.url;
          timers.push(
            setTimeout(
              () => void refresh(),
              Math.max(30, asset.expires_in - 45) * 1000,
            ),
          );
        } catch {
          image.alt = "사진을 불러오지 못했습니다.";
        }
      };
      void refresh();
    }
    return () => {
      disposed = true;
      timers.forEach(clearTimeout);
    };
  }, [api, html, siteId]);
  return <div ref={root} dangerouslySetInnerHTML={{ __html: html }} />;
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
  const api = useMemo(() => createBrowserTravelApi(), []);
  const [asset, setAsset] = useState<{
    url: string;
    expires_in: number;
    metadata: Record<string, unknown>;
    preview_asset_id: string | null;
  }>();
  const [error, setError] = useState("");
  useEffect(() => {
    let disposed = false;
    let timer: ReturnType<typeof setTimeout>;
    const refresh = async () => {
      try {
        const next = await api.call("asset.access", {
          id: assetId,
          site_id: siteId,
        });
        if (disposed) return;
        setAsset(next);
        setError("");
        timer = setTimeout(
          () => void refresh(),
          Math.max(30, next.expires_in - 45) * 1000,
        );
      } catch {
        if (!disposed)
          setError(
            "PDF를 열 수 없습니다. 공개 여부나 파일 접근 권한을 확인해 주세요.",
          );
      }
    };
    void refresh();
    return () => {
      disposed = true;
      clearTimeout(timer);
    };
  }, [api, assetId, siteId]);
  return (
    <section className="my-6 space-y-2" aria-label="PDF 일정표">
      <h2>{title}</h2>
      {error ? (
        <p role="alert">{error}</p>
      ) : asset ? (
        <>
          <p>{String(asset.metadata.page_count ?? "")}쪽</p>
          {asset.preview_asset_id ? (
            <PrivateImage
              assetId={asset.preview_asset_id}
              siteId={siteId}
              title={`${title} 첫 페이지`}
            />
          ) : null}
          <a href={asset.url} target="_blank" rel="noreferrer">
            PDF 다운로드
          </a>
          <iframe
            src={asset.url}
            title={title}
            className="h-[80vh] w-full rounded border"
          />
        </>
      ) : (
        <p role="status">PDF를 여는 중…</p>
      )}
    </section>
  );
}
