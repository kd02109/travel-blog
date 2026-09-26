import { expect, it, vi } from "vitest";
import { createServerReader } from "./server-transport";
it("uses HTTP travel-api with per-request credentials and no cache", async () => {
  const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response("[]"));
  const reader = createServerReader({
    baseURL: "http://127.0.0.1:1234/functions/v1/travel-api",
    getAccessToken: async () => "current",
    fetch: fetcher,
  });
  await reader.listPosts({ site_id: "10000000-0000-4000-8000-000000000001" });
  expect(fetcher.mock.calls[0]?.[1]).toMatchObject({
    method: "POST",
    cache: "no-store",
    headers: { Authorization: "Bearer current" },
  });
  expect(JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body))).toMatchObject({
    action: "posts.list",
    input: { limit: 12, offset: 0 },
  });
});
it("rejects mutations before network access and rejects malformed responses", async () => {
  const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response("{}"));
  const reader = createServerReader({
    baseURL: "http://localhost/api",
    fetch: fetcher,
  });
  await expect(
    // @ts-expect-error server reads cannot perform writes
    reader.read("profile.save", { display_name: "test" }),
  ).rejects.toThrow("read actions");
  expect(fetcher).not.toHaveBeenCalled();
  await expect(reader.getSite()).rejects.toThrow();
});
