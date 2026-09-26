"use client";
import { useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { ActionInput, ActionOutput } from "@repo/contracts";
import type { ReadAction, MutationAction } from "./actions";
import type { createBrowserTravelApi } from "./browser";
import {
  travelKeys,
  invalidationKeys,
  createSingleFlight,
  type QueryScope,
} from "./query";
import { shouldRetryQuery } from "./errors";
type Api = ReturnType<typeof createBrowserTravelApi>;
export function useTravelQuery<A extends ReadAction>(
  api: Api,
  action: A,
  input: ActionInput<NoInfer<A>>,
  scope: QueryScope,
  options: { initialData?: ActionOutput<A>; enabled?: boolean } = {},
) {
  return useQuery<ActionOutput<A>, Error>({
    queryKey: travelKeys.read(scope, action, input),
    queryFn: () => api.call(action, input),
    retry: shouldRetryQuery,
    staleTime: 60000,
    ...options,
  });
}
export function useTravelMutation<A extends MutationAction>(
  api: Api,
  action: A,
  scope: QueryScope,
) {
  const client = useQueryClient();
  const mutation = useMutation({
    mutationKey: ["travel-mutation", scope.siteId, scope.actor, action],
    mutationFn: (input: ActionInput<A>) => api.mutate(action, input),
    retry: false,
    onSuccess: async () => {
      await Promise.all(
        invalidationKeys(scope, action).map((queryKey) =>
          client.invalidateQueries({ queryKey }),
        ),
      );
    },
  });
  const { mutateAsync } = mutation;
  const submit = useMemo(
    () => createSingleFlight((input: ActionInput<A>) => mutateAsync(input)),
    [mutateAsync],
  );
  return { ...mutation, submit };
}
