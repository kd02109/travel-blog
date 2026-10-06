"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { createBrowserTravelApi } from "@repo/api-client/browser";
import Image from "next/image";
import { Button } from "@repo/ui/button";

export function PrivateImage({
  assetId,
  siteId,
  title,
  className,
  eager = false,
}: {
  assetId: string;
  siteId: string;
  title: string;
  className?: string;
  eager?: boolean;
}) {
  const api = useMemo(() => createBrowserTravelApi(), []);
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
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
  }, [api, assetId, siteId, retry]);
  return error ? (
    <div role="alert" className="space-y-2"><p>{error}</p><Button variant="outline" onClick={() => setRetry((current) => current + 1)}>사진 다시 불러오기</Button></div>
  ) : url ? (
    <Image
      src={url}
      alt={title}
      width={1600}
      height={1200}
      unoptimized
      loading={eager ? "eager" : "lazy"}
      fetchPriority={eager ? "high" : undefined}
      className={className ?? "h-auto max-h-[70vh] max-w-full rounded object-contain"}
    />
  ) : (
    <p role="status">사진을 여는 중…</p>
  );
}

export function PdfCover({ assetId, siteId, title }: { assetId: string; siteId: string; title: string }) {
  const api = useMemo(() => createBrowserTravelApi(), []);
  const [previewAssetId, setPreviewAssetId] = useState("");
  const [failed, setFailed] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    void api.call("asset.access", { id: assetId, site_id: siteId }).then((asset) => {
      if (active) setPreviewAssetId(asset.preview_asset_id ?? "");
    }).catch(() => { if (active) setFailed(true); });
    return () => { active = false; };
  }, [api, assetId, siteId, retry]);
  if (previewAssetId) return <PrivateImage assetId={previewAssetId} siteId={siteId} title={`${title} 표지`} className="h-full w-full max-h-none rounded-none object-cover" />;
  return <div className="flex aspect-[3/2] flex-col items-center justify-center gap-2 bg-muted px-4 text-center text-sm text-muted-foreground" role={failed ? "alert" : "status"}>{failed ? <>PDF 표지를 불러오지 못했습니다<Button variant="outline" onClick={() => setRetry((current) => current + 1)}>다시 불러오기</Button></> : "PDF 표지를 여는 중…"}</div>;
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
      const retryButton = document.createElement("button");
      retryButton.type = "button";
      retryButton.className = "my-2 min-h-12 rounded border px-4 underline underline-offset-4";
      retryButton.textContent = "사진 다시 불러오기";
      retryButton.hidden = true;
      figure.append(retryButton);
      const refresh = async () => {
        try {
          const asset = await api.call("asset.access", { id, site_id: siteId });
          if (disposed) return;
          image.src = asset.url;
          image.alt = figure.querySelector("figcaption")?.textContent ?? "여행 사진";
          retryButton.hidden = true;
          timers.push(
            setTimeout(
              () => void refresh(),
              Math.max(30, asset.expires_in - 45) * 1000,
            ),
          );
        } catch {
          image.alt = "사진을 불러오지 못했습니다.";
          retryButton.hidden = false;
        }
      };
      retryButton.addEventListener("click", () => void refresh());
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
  const [retry, setRetry] = useState(0);
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
  }, [api, assetId, siteId, retry]);
  return (
    <section className="my-6 space-y-2" aria-label="PDF 일정표">
      <h2>{title}</h2>
      {error ? (
        <div role="alert" className="space-y-2"><p>{error}</p><Button variant="outline" onClick={() => setRetry((current) => current + 1)}>PDF 다시 불러오기</Button></div>
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
