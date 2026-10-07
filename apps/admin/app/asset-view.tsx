"use client";
import { useEffect, useMemo } from "react";
import { createBrowserTravelApi } from "@repo/api-client/browser";
import { ApiErrorState } from "@repo/api-client/feedback";
import { useTravelQuery } from "@repo/api-client/hooks";
import Image from "next/image";
import dynamic from "next/dynamic";

const PdfReader = dynamic(() => import("@repo/pdf-reader"), {
  ssr: false,
  loading: () => (
    <div
      className="bg-muted/30 flex min-h-[560px] items-center justify-center border p-6"
      role="status"
    >
      <div className="bg-background/70 aspect-[3/4] w-full max-w-[420px] animate-pulse p-8">
        <span className="sr-only">PDF 문서를 불러오는 중입니다.</span>
        <div className="bg-muted h-3 w-1/3" />
        <div className="bg-muted mt-12 h-7 w-3/4" />
        <div className="bg-muted mt-8 h-3 w-full" />
        <div className="bg-muted mt-3 h-3 w-5/6" />
      </div>
    </div>
  ),
});

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
  if (kind === "pdf")
    return (
      <PdfReader
        key={assetId}
        assetId={assetId}
        siteId={siteId}
        title={title}
      />
    );
  return (
    <PrivateImageAssetView
      assetId={assetId}
      siteId={siteId}
      title={title}
      className={className}
    />
  );
}

function PrivateImageAssetView({
  assetId,
  siteId,
  title,
  className,
}: {
  assetId: string;
  siteId: string;
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
}
