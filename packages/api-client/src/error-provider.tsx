"use client";

import { createContext, useContext, type ReactNode } from "react";
import {
  describeApiError,
  type ApiErrorDescription,
  type ApiErrorOperation,
} from "./errors";

export type ApiErrorDescriber = (
  error: unknown,
  operation: ApiErrorOperation,
) => ApiErrorDescription;

const ApiErrorContext = createContext<ApiErrorDescriber>(describeApiError);

/** Shares one error presentation policy without issuing duplicate global notices. */
export function ApiErrorProvider({
  children,
  describe = describeApiError,
}: {
  children: ReactNode;
  describe?: ApiErrorDescriber;
}) {
  return (
    <ApiErrorContext.Provider value={describe}>
      {children}
    </ApiErrorContext.Provider>
  );
}

export function useApiErrorGuidance(
  error: unknown,
  operation: ApiErrorOperation,
) {
  return useContext(ApiErrorContext)(error, operation);
}
