"use client";
import { createTravelApi } from "./index";
import { readActions, type MutationAction } from "./actions";
import type { ActionInput } from "@repo/contracts";
/** Browser-only factory. Server requests cannot be intercepted by MirageJS. */
export function createBrowserTravelApi(
  options: Omit<Parameters<typeof createTravelApi>[0], "baseURL"> = {},
) {
  const mocking =
    process.env.NODE_ENV === "development" &&
    process.env.NEXT_PUBLIC_API_MOCKING === "enabled";
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!mocking && !url) throw new Error("Supabase URL is not configured.");
  const api = createTravelApi({
    ...options,
    baseURL: mocking
      ? "/__mock__/functions/v1/travel-api"
      : `${url}/functions/v1/travel-api`,
  });
  return {
    ...api,
    mutate<A extends MutationAction>(
      action: A,
      input: ActionInput<NoInfer<A>>,
    ) {
      if ((readActions as readonly string[]).includes(action))
        throw new Error("Use a query for read actions");
      return api.call(action, input);
    },
  };
}
