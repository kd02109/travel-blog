import { expect, it, vi } from "vitest";
import {
  createSessionTokenProvider,
  createVisitorTokenProvider,
} from "./tokens";
import { TravelApiError, parseRetryAfter, shouldRetryQuery } from "./errors";
it("coalesces imminent session refresh and stops using a signed-out session", async () => {
  const auth = {
    getSession: vi.fn().mockResolvedValue({
      data: { session: { access_token: "old", expires_at: 1 } },
      error: null,
    }),
    refreshSession: vi.fn().mockResolvedValue({
      data: { session: { access_token: "new", expires_at: 999 } },
      error: null,
    }),
  };
  const get = createSessionTokenProvider(auth, () => 1000);
  expect(await Promise.all([get(), get()])).toEqual(["new", "new"]);
  expect(auth.refreshSession).toHaveBeenCalledTimes(1);
  auth.getSession.mockResolvedValue({ data: { session: null }, error: null });
  expect(await get()).toBeUndefined();
});
it("fails closed when session refresh fails", async () => {
  const get = createSessionTokenProvider({
    getSession: async () => ({
      data: { session: { access_token: "old", expires_at: 1 } },
      error: null,
    }),
    refreshSession: async () => ({ data: { session: null }, error: "failed" }),
  });
  await expect(get()).rejects.toMatchObject({
    status: 401,
    code: "session_expired",
  });
});
it("coalesces visitors, renews expired tokens and supports invalidation", async () => {
  let now = 0;
  const issue = vi
    .fn()
    .mockResolvedValueOnce({ visitor_token: "one", expires_at: 60 })
    .mockResolvedValue({ visitor_token: "two", expires_at: 200 });
  const visitor = createVisitorTokenProvider(issue, () => now);
  expect(await Promise.all([visitor.get(), visitor.get()])).toEqual([
    "one",
    "one",
  ]);
  expect(issue).toHaveBeenCalledTimes(1);
  now = 61000;
  expect(await visitor.get()).toBe("two");
  visitor.clear();
  await visitor.get();
  expect(issue).toHaveBeenCalledTimes(3);
});
it("restores the same visitor identity from tab storage after a page reload", async () => {
  const values = new Map<string, string>();
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  };
  const issue = vi
    .fn()
    .mockResolvedValue({ visitor_token: "tab-token", expires_at: 300 });
  const firstPage = createVisitorTokenProvider(issue, () => 0, storage);
  expect(await firstPage.get()).toBe("tab-token");
  const reloadedPage = createVisitorTokenProvider(issue, () => 0, storage);
  expect(await reloadedPage.get()).toBe("tab-token");
  expect(issue).toHaveBeenCalledTimes(1);
  reloadedPage.clear();
  expect(values.size).toBe(0);
});
it("parses rate limits and never auto retries auth, permissions, conflict or rate limits", () => {
  expect(parseRetryAfter("12")).toBe(12);
  expect(parseRetryAfter("Thu, 01 Jan 1970 00:01:00 GMT", 0)).toBe(60);
  expect(parseRetryAfter("invalid")).toBeUndefined();
  for (const status of [401, 403, 409, 429])
    expect(shouldRetryQuery(0, new TravelApiError(status, "test"))).toBe(false);
  expect(shouldRetryQuery(0, new TravelApiError(503, "test"))).toBe(true);
  expect(shouldRetryQuery(1, new TravelApiError(503, "test"))).toBe(false);
});
