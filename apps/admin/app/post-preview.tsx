"use client";

import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import Image from "next/image";
import { createBrowserTravelApi } from "@repo/api-client/browser";
import { ApiErrorState } from "@repo/api-client/feedback";
import { useTravelQuery } from "@repo/api-client/hooks";
import { CATEGORIES, type CategoryCode } from "@repo/constants";
import { PrivateAssetView } from "./asset-view";
import styles from "./post-preview.module.css";

const EMPTY_ID = "00000000-0000-4000-8000-000000000000";

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function formatDay(value: unknown): string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value))
    return "";
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ||
    date.toISOString().slice(0, 10) !== value
    ? ""
    : new Intl.DateTimeFormat("ko-KR", { dateStyle: "long" }).format(date);
}

function visitInformation(
  category: CategoryCode,
  metadata: Record<string, unknown>,
): string {
  switch (category) {
    case "day-walk": {
      const day = formatDay(metadata.visited_on);
      return day ? `다녀온 날 ${day}` : "";
    }
    case "overnight-trip": {
      const start = formatDay(metadata.start_date);
      const end = formatDay(metadata.end_date);
      return start ? `여행 기간 ${start}${end ? ` – ${end}` : ""}` : "";
    }
    case "food-cafe": {
      const day = formatDay(metadata.visited_on);
      const place = text(metadata.place_name);
      const venue = metadata.venue_type === "cafe" ? "카페" : "음식점";
      return [venue, place, day ? `방문일 ${day}` : ""]
        .filter(Boolean)
        .join(" · ");
    }
    case "stay-review": {
      const checkIn = formatDay(metadata.check_in);
      const checkOut = formatDay(metadata.check_out);
      return [
        text(metadata.place_name) || "숙소",
        [checkIn, checkOut].filter(Boolean).join(" – "),
      ]
        .filter(Boolean)
        .join(" · ");
    }
    default:
      return "";
  }
}

function useAssetAccess(assetId: string, siteId: string) {
  const api = useMemo(() => createBrowserTravelApi(), []);
  const asset = useTravelQuery(
    api,
    "asset.access",
    { id: assetId || EMPTY_ID, site_id: siteId || EMPTY_ID },
    { siteId, actor: "session" },
    { enabled: Boolean(assetId && siteId), staleTime: 60_000 },
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
  return asset;
}

function DraftCover({
  assetId,
  siteId,
  title,
  caption,
  children,
}: {
  assetId: string;
  siteId: string;
  title: string;
  caption: string;
  children: ReactNode;
}) {
  const asset = useAssetAccess(assetId, siteId);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const [imageError, setImageError] = useState(false);
  const [imageAttempt, setImageAttempt] = useState(0);
  const error =
    (asset.data ? null : asset.error) ??
    (imageError ? new Error("image_load_failed") : null);
  const photoStyle = dimensions.width
    ? ({
        "--photo-width": `${dimensions.width}px`,
        "--photo-height": `${dimensions.height}px`,
      } as CSSProperties)
    : undefined;

  return (
    <figure className={styles.cover}>
      <div className={styles.stage} style={photoStyle}>
        {asset.data && !imageError && (
          <>
            <Image
              key={`backdrop-${imageAttempt}-${asset.data.url}`}
              src={asset.data.url}
              alt=""
              width={1600}
              height={1200}
              unoptimized
              aria-hidden="true"
              className={styles.backdrop}
            />
            <span
              className={styles.photoFrame}
              style={{
                maxWidth: dimensions.width || undefined,
                maxHeight: dimensions.height || undefined,
              }}
            >
              <Image
                key={`cover-${imageAttempt}-${asset.data.url}`}
                src={asset.data.url}
                alt={`${title} 대표 사진`}
                width={1600}
                height={1200}
                unoptimized
                className={styles.photo}
                onLoad={(event) =>
                  setDimensions({
                    width: event.currentTarget.naturalWidth,
                    height: event.currentTarget.naturalHeight,
                  })
                }
                onError={() => setImageError(true)}
              />
            </span>
          </>
        )}
        {!asset.data && !error && (
          <div className={styles.photoStatus} role="status">
            대표 사진을 불러오는 중…
          </div>
        )}
        {error && (
          <div className={styles.photoStatus}>
            <ApiErrorState
              error={error}
              title="대표 사진을 불러오지 못했어요"
              onRetry={() => {
                setImageError(false);
                setImageAttempt((attempt) => attempt + 1);
                void asset.refetch();
              }}
              isRetrying={asset.isFetching}
            />
          </div>
        )}
        <div className={styles.overlay}>{children}</div>
      </div>
      {caption && <figcaption className={styles.caption}>{caption}</figcaption>}
    </figure>
  );
}

function PdfFirstPage({
  assetId,
  siteId,
  title,
}: {
  assetId: string;
  siteId: string;
  title: string;
}) {
  const asset = useAssetAccess(assetId, siteId);
  if (asset.isError && !asset.data)
    return (
      <ApiErrorState
        error={asset.error}
        title="PDF 첫 페이지를 불러오지 못했어요"
        onRetry={() => void asset.refetch()}
        isRetrying={asset.isFetching}
      />
    );
  if (!asset.data) return <p role="status">PDF 첫 페이지를 불러오는 중…</p>;
  if (!asset.data.preview_asset_id)
    return (
      <p className={styles.pdfUnavailable}>
        첫 페이지 이미지가 준비되지 않았어요. 파일 처리 상태를 확인해 주세요.
      </p>
    );
  return (
    <PrivateAssetView
      assetId={asset.data.preview_asset_id}
      siteId={siteId}
      kind="image"
      title={`${title} PDF 첫 페이지`}
      className={styles.pdfImage}
    />
  );
}

export function PostPreview({
  open,
  onClose,
  kind,
  category,
  title,
  metadata,
  tags,
  coverAssetId,
  pdfAssetId,
  siteId,
  publishedAt,
  checks,
  body,
}: {
  open: boolean;
  onClose: () => void;
  kind: "article" | "pdf";
  category: CategoryCode;
  title: string;
  metadata: Record<string, unknown>;
  tags: string[];
  coverAssetId: string;
  pdfAssetId: string;
  siteId: string;
  publishedAt: string | null;
  checks: Array<{ label: string; valid: boolean }>;
  body?: ReactNode;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const headingId = useId();
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      returnFocusRef.current =
        document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null;
      dialog.showModal();
      dialog.scrollTop = 0;
      closeRef.current?.focus();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  const safeTitle = title.trim() || "제목을 입력해 주세요";
  const categoryLabel =
    CATEGORIES.find((item) => item.code === category)?.label ?? "여행 기록";
  const region = text(metadata.region);
  const description = text(metadata.description);
  const coverCaption = text(metadata.cover_caption);
  const visitInfo =
    kind === "article" ? visitInformation(category, metadata) : "";
  const publishedDay = publishedAt ? formatDay(publishedAt.slice(0, 10)) : "";
  const header = (
    <header
      className={
        kind === "article" && coverAssetId ? styles.coverHead : styles.head
      }
    >
      <p className={styles.eyebrow}>
        <span>{categoryLabel}</span>
        {region && <span>{region}</span>}
      </p>
      <h3 className={styles.title}>{safeTitle}</h3>
      {description && <p className={styles.summary}>{description}</p>}
      <p className={styles.meta}>
        <span>{publishedDay ? `게시 ${publishedDay}` : "발행 전 초안"}</span>
        {visitInfo && <span>{visitInfo}</span>}
      </p>
    </header>
  );

  return (
    <dialog
      ref={dialogRef}
      className={styles.dialog}
      aria-labelledby={headingId}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClose={() => {
        onClose();
        returnFocusRef.current?.focus();
      }}
    >
      <div className={styles.toolbar}>
        <h2 id={headingId}>공개 화면 미리보기</h2>
        <button
          ref={closeRef}
          type="button"
          onClick={onClose}
          aria-label="미리보기 닫기"
        >
          닫기 <span aria-hidden="true">×</span>
        </button>
      </div>
      {open && (
        <div className={styles.page}>
          <p className={styles.draftNotice}>
            현재 입력 중인 내용을 보여줍니다. 발행 전에는 방문자에게 공개되지
            않습니다.
          </p>
          <section className={styles.checklist} aria-label="발행 전 확인">
            <strong>발행 전 확인</strong>
            <ul>
              {checks.map((check) => (
                <li key={check.label} data-valid={check.valid}>
                  <span aria-hidden="true">{check.valid ? "✓" : "○"}</span>{" "}
                  <span className="sr-only">
                    {check.valid ? "완료: " : "필요: "}
                  </span>
                  {check.label}
                </li>
              ))}
            </ul>
          </section>
          <article className={styles.article}>
            {kind === "article" && coverAssetId && siteId ? (
              <DraftCover
                key={coverAssetId}
                assetId={coverAssetId}
                siteId={siteId}
                title={safeTitle}
                caption={coverCaption}
              >
                {header}
              </DraftCover>
            ) : (
              header
            )}
            {kind === "article" && body && (
              <section
                className={styles.reading}
                aria-label="여행 이야기 미리보기"
              >
                <div className={styles.body}>{body}</div>
              </section>
            )}
            {kind === "pdf" && (
              <section
                className={styles.pdfSection}
                aria-label="PDF 첫 페이지 미리보기"
              >
                {pdfAssetId && siteId ? (
                  <PdfFirstPage
                    assetId={pdfAssetId}
                    siteId={siteId}
                    title={safeTitle}
                  />
                ) : (
                  <p className={styles.pdfUnavailable}>
                    PDF 파일을 선택하면 첫 페이지가 여기에 표시됩니다.
                  </p>
                )}
              </section>
            )}
            {kind === "article" && tags.length > 0 && (
              <div className={styles.tags} aria-label="글 태그">
                {tags.map((tag) => (
                  <span key={tag}>#{tag}</span>
                ))}
              </div>
            )}
          </article>
        </div>
      )}
    </dialog>
  );
}
