"use client";

import type { ComponentProps } from "react";
import {
  ApiErrorState,
  type ApiErrorFeedbackProps,
} from "@repo/api-client/feedback";
import { ErrorState } from "@repo/ui/feedback";
import styles from "./public-feedback.module.css";

type PublicSize = "small" | "default" | "tall";

function surfaceClass(size: PublicSize, className?: string) {
  return `${styles.surface} ${styles[size]} ${className ?? ""}`;
}

export function PublicApiErrorState({
  size = "default",
  className,
  ...props
}: ApiErrorFeedbackProps & {
  size?: PublicSize;
}) {
  return <ApiErrorState {...props} className={surfaceClass(size, className)} />;
}

export function PublicErrorState({
  size = "default",
  className,
  ...props
}: ComponentProps<typeof ErrorState> & { size?: PublicSize }) {
  return <ErrorState {...props} className={surfaceClass(size, className)} />;
}
