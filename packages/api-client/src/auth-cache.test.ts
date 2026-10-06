import { expect, it, vi } from "vitest";
import { QueryClient, QueryObserver } from "@tanstack/react-query";
import { createAuthCacheSync } from "./auth-cache";

it("lets an in-flight query finish during the first auth events", async () => {
  const client = new QueryClient();
  const sync = createAuthCacheSync(client);
  let resolveRequest: (value: string) => void = () => {};
  const observer = new QueryObserver(client, {
    queryKey: ["me"],
    queryFn: () =>
      new Promise<string>((resolve) => {
        resolveRequest = resolve;
      }),
  });
  const unsubscribe = observer.subscribe(() => {});

  expect(observer.getCurrentResult().fetchStatus).toBe("fetching");
  sync("SIGNED_IN", "user-a");
  sync("INITIAL_SESSION", "user-a");
  resolveRequest("user-a");

  await vi.waitFor(() =>
    expect(observer.getCurrentResult()).toMatchObject({
      status: "success",
      data: "user-a",
    }),
  );
  expect(client.getQueryData(["me"])).toBe("user-a");
  unsubscribe();
});

it("resets active queries and mutations when the authenticated user changes", async () => {
  const client = new QueryClient();
  const sync = createAuthCacheSync(client);
  const pending: Array<(value: string) => void> = [];
  const observer = new QueryObserver(client, {
    queryKey: ["me"],
    queryFn: () =>
      new Promise<string>((resolve) => {
        pending.push(resolve);
      }),
  });
  const unsubscribe = observer.subscribe(() => {});

  sync("SIGNED_IN", "user-a");
  pending.shift()?.("user-a");
  await vi.waitFor(() =>
    expect(observer.getCurrentResult().data).toBe("user-a"),
  );
  client.getMutationCache().build(client, { mutationKey: ["save"] });

  sync("TOKEN_REFRESHED", "user-a");
  expect(observer.getCurrentResult().data).toBe("user-a");
  expect(pending).toHaveLength(0);

  sync("SIGNED_IN", "user-b");
  expect(observer.getCurrentResult().data).toBeUndefined();
  expect(client.getMutationCache().getAll()).toHaveLength(0);
  await vi.waitFor(() => expect(pending).toHaveLength(1));
  pending.shift()?.("user-b");
  await vi.waitFor(() =>
    expect(observer.getCurrentResult().data).toBe("user-b"),
  );

  sync("SIGNED_OUT", undefined);
  expect(observer.getCurrentResult().data).toBeUndefined();
  await vi.waitFor(() => expect(pending).toHaveLength(1));
  pending.shift()?.("signed-out");
  await vi.waitFor(() =>
    expect(observer.getCurrentResult().data).toBe("signed-out"),
  );
  unsubscribe();
});
