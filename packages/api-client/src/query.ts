import { parseActionInput, type ActionInput } from "@repo/contracts";
import type { ReadAction, MutationAction } from "./actions";
export type QueryScope = { siteId: string; actor: string };
export const travelKeys = {
  site: (siteId: string) => ["travel", siteId] as const,
  read: <A extends ReadAction>(
    scope: QueryScope,
    action: A,
    input: ActionInput<A>,
  ) =>
    [
      "travel",
      scope.siteId,
      scope.actor,
      action,
      parseActionInput(action, input),
    ] as const,
};
export function invalidationKeys(
  scope: QueryScope,
  action: MutationAction,
): readonly (readonly unknown[])[] {
  return action === "profile.save" || action.startsWith("admin.settings.")
    ? [["travel"]]
    : [travelKeys.site(scope.siteId)];
}
export function createSingleFlight<T, R>(run: (input: T) => Promise<R>) {
  let pending: Promise<R> | undefined;
  return (input: T) => {
    if (!pending)
      pending = Promise.resolve()
        .then(() => run(input))
        .finally(() => {
          pending = undefined;
        });
    return pending;
  };
}
export function pageOffset(page: number, size = 12) {
  return (
    (Math.max(
      1,
      Math.min(Math.floor(100000 / size) + 1, Math.floor(page) || 1),
    ) -
      1) *
    size
  );
}
