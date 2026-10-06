"use client";
import { useEffect, useMemo, useState } from "react";
import { createBrowserTravelApi } from "@repo/api-client/browser";
import { ApiErrorState } from "@repo/api-client/feedback";
import type { ActionOutput } from "@repo/contracts";
import Image from "next/image";

export function PrivateAssetView({
  assetId,
  siteId,
  kind,
  title,
  className,
}: {
  assetId: string;
  siteId: string;
  kind: "image" | "pdf";
  title: string;
  className?: string;
}) {
  const api = useMemo(() => createBrowserTravelApi(), []);
  const [asset, setAsset] = useState<ActionOutput<"asset.access">>();
  const [error, setError] = useState<unknown>(null);
  const [retryKey, setRetryKey] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  useEffect(() => {
    let disposed = false;
    let timer: ReturnType<typeof setTimeout>;
    const load = async () => {
      setRefreshing(true);
      try {
        const value = await api.call("asset.access", {
          id: assetId,
          site_id: siteId,
        });
        if (disposed) return;
        setAsset(value);
        setError(null);
        timer = setTimeout(
          () => void load(),
          Math.max(30, value.expires_in - 45) * 1000,
        );
      } catch (failure) {
        if (!disposed) setError(failure);
      } finally {
        if (!disposed) setRefreshing(false);
      }
    };
    void load();
    return () => {
      disposed = true;
      clearTimeout(timer);
    };
  }, [api, assetId, siteId, retryKey]);
  if (error)
    return (
      <ApiErrorState
        error={error}
        onRetry={() => setRetryKey((current) => current + 1)}
        isRetrying={refreshing}
        title="파일을 열지 못했어요"
      />
    );
  if (!asset) return <p role="status">파일을 여는 중…</p>;
  if (kind === "image")
    return (
      <Image
        src={asset.url}
        alt={title}
        width={1200}
        height={900}
        unoptimized
        className={
          className ?? "h-auto max-h-96 max-w-full rounded object-contain"
        }
      />
    );
  return (
    <div className="space-y-3">
      {asset.preview_asset_id ? (
        <div>
          <p className="text-muted-foreground mb-2 text-sm">
            첫 페이지 미리보기
          </p>
          <PrivateAssetView
            assetId={asset.preview_asset_id}
            siteId={siteId}
            kind="image"
            title={`${title} 첫 페이지`}
          />
        </div>
      ) : null}
      <a href={asset.url} target="_blank" rel="noreferrer">
        PDF 다운로드
      </a>
      <iframe
        src={asset.url}
        title={title}
        className="h-[75vh] w-full rounded border"
      />
    </div>
  );
}
