import * as React from "react";
import {
  AlertCircle,
  CheckCircle2,
  LockKeyhole,
  RefreshCw,
} from "lucide-react";
import { Button } from "./button";
import { cn } from "./lib/utils";

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <section
      className="rounded-panel border-input bg-surface border border-dashed px-6 py-12 text-center"
      aria-label={title}
    >
      <h2 className="text-xl font-semibold">{title}</h2>
      <p className="text-muted-foreground mx-auto mt-2 max-w-xl text-base">
        {description}
      </p>
      {action && <div className="mt-6 flex justify-center">{action}</div>}
    </section>
  );
}

export function ErrorState({
  title = "불러오지 못했어요",
  description,
  onRetry,
  retryPending = false,
  retryDisabled = false,
  retryLabel = "다시 시도",
  compact = false,
  details,
  className,
}: {
  title?: string;
  description: string;
  onRetry?: () => void;
  retryPending?: boolean;
  retryDisabled?: boolean;
  retryLabel?: string;
  compact?: boolean;
  details?: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      role="alert"
      aria-busy={retryPending}
      className={cn(
        "rounded-panel border-destructive/40 bg-destructive-surface text-destructive border",
        compact ? "p-4" : "p-6",
        className,
      )}
    >
      <div className="flex items-start gap-3">
        <AlertCircle aria-hidden="true" className="mt-1 size-5 shrink-0" />
        <div>
          <h2 className="font-semibold">{title}</h2>
          <p className="mt-1 text-base">{description}</p>
          {onRetry && (
            <Button
              type="button"
              variant="outline"
              className={cn(
                "border-destructive text-destructive",
                compact ? "mt-3" : "mt-4",
              )}
              onClick={onRetry}
              disabled={retryPending || retryDisabled}
            >
              <RefreshCw
                aria-hidden="true"
                className={cn("size-4", retryPending && "animate-spin")}
              />
              <span aria-live="off">
                {retryPending ? "다시 시도 중…" : retryLabel}
              </span>
            </Button>
          )}
          {details && (
            <div className="text-muted-foreground mt-3 text-xs">{details}</div>
          )}
        </div>
      </div>
    </section>
  );
}

export function ForbiddenState({
  title = "접근할 수 없어요",
  description = "이 화면을 볼 수 있는 권한이 있는지 확인해 주세요.",
  action,
}: {
  title?: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <section
      role="alert"
      className="rounded-panel border-border bg-surface mx-auto max-w-xl border p-8 text-center"
    >
      <LockKeyhole
        aria-hidden="true"
        className="text-muted-foreground mx-auto size-8"
      />
      <h1 className="mt-4 text-2xl font-semibold">{title}</h1>
      <p className="text-muted-foreground mt-2 text-base">{description}</p>
      {action && <div className="mt-6">{action}</div>}
    </section>
  );
}

export function Toast({
  title,
  description,
  variant = "success",
  onDismiss,
  className,
}: {
  title: string;
  description?: string;
  variant?: "success" | "error";
  onDismiss?: () => void;
  className?: string;
}) {
  const isError = variant === "error";
  const Icon = isError ? AlertCircle : CheckCircle2;
  return (
    <div
      role={isError ? "alert" : "status"}
      aria-live={isError ? "assertive" : "polite"}
      className={cn(
        "rounded-panel bg-surface flex items-start gap-3 border p-4 shadow-[0_8px_24px_rgb(23_60_66_/_12%)]",
        isError ? "border-destructive/40" : "border-border",
        className,
      )}
    >
      <Icon
        aria-hidden="true"
        className={cn(
          "mt-0.5 size-5 shrink-0",
          isError ? "text-destructive" : "text-success",
        )}
      />
      <div className="min-w-0 flex-1">
        <p className="font-semibold">{title}</p>
        {description && (
          <p className="text-muted-foreground mt-1 text-sm">{description}</p>
        )}
      </div>
      {onDismiss && (
        <button
          type="button"
          aria-label="알림 닫기"
          className="rounded-control text-muted-foreground hover:bg-muted -m-2 inline-flex size-12 shrink-0 items-center justify-center text-sm"
          onClick={onDismiss}
        >
          닫기
        </button>
      )}
    </div>
  );
}
