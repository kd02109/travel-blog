"use client";

import { useEffect, useState } from "react";
import { ErrorState } from "@repo/ui/feedback";
import { TravelApiError, type ApiErrorOperation } from "./errors";
import { useApiErrorGuidance } from "./error-provider";

export type ApiErrorFeedbackProps = {
  error: unknown;
  onRetry?: () => void;
  isRetrying?: boolean;
  title?: string;
  description?: string;
  className?: string;
};

function useRetryCountdown(retryAt?: number) {
  const [countdown, setCountdown] = useState<{
    retryAt: number;
    remainingSeconds: number;
  }>();

  useEffect(() => {
    if (retryAt === undefined) return;
    const update = () => {
      const remainingSeconds = Math.max(
        0,
        Math.ceil((retryAt - Date.now()) / 1000),
      );
      setCountdown((previous) =>
        previous?.retryAt === retryAt &&
        previous.remainingSeconds === remainingSeconds
          ? previous
          : { retryAt, remainingSeconds },
      );
    };
    update();
    const timer = window.setInterval(update, 1000);
    return () => window.clearInterval(timer);
  }, [retryAt]);

  return countdown && countdown.retryAt === retryAt
    ? countdown.remainingSeconds
    : undefined;
}

function ApiErrorFeedback({
  error,
  operation,
  compact,
  onRetry,
  isRetrying = false,
  title,
  description,
  className,
}: ApiErrorFeedbackProps & {
  operation: ApiErrorOperation;
  compact: boolean;
}) {
  const guidance = useApiErrorGuidance(error, operation);
  const remainingSeconds = useRetryCountdown(guidance.retryAt);
  const waitingForRateLimit =
    guidance.retryAt !== undefined &&
    (remainingSeconds === undefined || remainingSeconds > 0);

  return (
    <ErrorState
      title={title ?? guidance.title}
      description={description ?? guidance.description}
      onRetry={guidance.canRetry ? onRetry : undefined}
      retryPending={isRetrying}
      retryDisabled={waitingForRateLimit}
      retryLabel={
        waitingForRateLimit && remainingSeconds !== undefined
          ? `${remainingSeconds}초 후 다시 시도`
          : "다시 시도"
      }
      compact={compact}
      details={
        error instanceof TravelApiError && error.requestId ? (
          <span>
            오류 추적 ID: <code>{error.requestId}</code>
          </span>
        ) : undefined
      }
      className={className}
    />
  );
}

/** A recoverable read/query failure, with a manual refetch action when safe. */
export function ApiErrorState(props: ApiErrorFeedbackProps) {
  return <ApiErrorFeedback {...props} operation="read" compact={false} />;
}

/** A write failure. Retry appears only when the caller explicitly supplies it. */
export function ApiMutationError(props: ApiErrorFeedbackProps) {
  return <ApiErrorFeedback {...props} operation="write" compact />;
}
