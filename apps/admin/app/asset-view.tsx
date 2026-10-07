"use client";
import { useEffect, useMemo } from "react";
import { createBrowserTravelApi } from "@repo/api-client/browser";
import { ApiErrorState } from "@repo/api-client/feedback";
import { useTravelQuery } from "@repo/api-client/hooks";
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
  const asset = useTravelQuery(
    api,
    "asset.access",
    { id: assetId, site_id: siteId },
    { siteId, actor: "session" },
    { enabled: !!assetId && !!siteId, staleTime: 60_000 },
  );
  const { data, dataUpdatedAt, refetch } = asset;
  useEffect(() => {
    if (!data) return;
    const timer = window.setTimeout(
      () => void refetch({ cancelRefetch: false }),
      Math.max(
        0,
        dataUpdatedAt + Math.max(30, data.expires_in - 45) * 1000 - Date.now(),
      ),
    );
    return () => window.clearTimeout(timer);
  }, [data, dataUpdatedAt, refetch]);
  if (asset.isError)
    return (
      <ApiErrorState
        error={asset.error}
        onRetry={() => void refetch()}
        isRetrying={asset.isFetching}
        title="파일을 열지 못했어요"
      />
    );
  if (!data) return <p role="status">파일을 여는 중…</p>;
  if (kind === "image")
    return (
      <Image
        src={data.url}
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
      {data.preview_asset_id ? (
        <div>
          <p className="text-muted-foreground mb-2 text-sm">
            첫 페이지 미리보기
          </p>
          <PrivateAssetView
            assetId={data.preview_asset_id}
            siteId={siteId}
            kind="image"
            title={`${title} 첫 페이지`}
          />
        </div>
      ) : null}
      <a href={data.url} target="_blank" rel="noreferrer">
        PDF 다운로드
      </a>
      <iframe
        src={data.url}
        title={title}
        className="h-[75vh] w-full rounded border"
      />
    </div>
  );
}
