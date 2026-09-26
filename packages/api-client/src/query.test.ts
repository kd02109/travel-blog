import { expect, it, vi } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import {
  createSingleFlight,
  travelKeys,
  invalidationKeys,
  pageOffset,
} from "./query";
const siteId = "10000000-0000-4000-8000-000000000001";
const scope = { siteId, actor: "public" };
it("normalizes pagination defaults and separates accounts, pages and filters", () => {
  const key = travelKeys.read(scope, "posts.list", { site_id: siteId });
  expect(key).toEqual(
    travelKeys.read(scope, "posts.list", {
      site_id: siteId,
      limit: 12,
      offset: 0,
    }),
  );
  expect(key).not.toEqual(
    travelKeys.read({ ...scope, actor: "other" }, "posts.list", {
      site_id: siteId,
    }),
  );
  expect(key).not.toEqual(
    travelKeys.read(scope, "posts.list", { site_id: siteId, offset: 12 }),
  );
  expect(key).not.toEqual(
    travelKeys.read(scope, "posts.list", {
      site_id: siteId,
      category: "day-walk",
    }),
  );
  expect(pageOffset(-1)).toBe(0);
  expect(pageOffset(2)).toBe(12);
});
it("invalidates public and private projections for the affected site", async () => {
  const client = new QueryClient();
  const publicKey = travelKeys.read(scope, "posts.list", { site_id: siteId });
  const privateKey = travelKeys.read(
    { ...scope, actor: "owner" },
    "admin.posts",
    { site_id: siteId },
  );
  client.setQueryData(publicKey, []);
  client.setQueryData(privateKey, []);
  await Promise.all(
    invalidationKeys(scope, "admin.post.publish").map((queryKey) =>
      client.invalidateQueries({ queryKey }),
    ),
  );
  expect(client.getQueryState(publicKey)?.isInvalidated).toBe(true);
  expect(client.getQueryState(privateKey)?.isInvalidated).toBe(true);
});
it("coalesces duplicate submission, preserves failed input, and allows explicit retry", async () => {
  const input = { title: "작성 중인 제목" };
  const run = vi
    .fn()
    .mockRejectedValueOnce(new Error("conflict"))
    .mockResolvedValueOnce("saved");
  const submit = createSingleFlight(run);
  const first = submit(input);
  const duplicate = submit(input);
  expect(first).toBe(duplicate);
  await expect(first).rejects.toThrow("conflict");
  expect(input.title).toBe("작성 중인 제목");
  expect(run).toHaveBeenCalledTimes(1);
  expect(await submit(input)).toBe("saved");
});
