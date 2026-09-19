import { beforeEach, expect, it, vi } from "vitest";
const { post } = vi.hoisted(() => ({ post: vi.fn() }));
vi.mock("axios", () => ({
  default: {
    create: () => ({ post }),
    isAxiosError: (error: unknown) =>
      Boolean(error && typeof error === "object" && "isAxiosError" in error),
  },
}));
import { createTravelApi, TravelApiError } from "./index";
beforeEach(() => {
  post.mockReset();
});
it("public calls omit bearer credentials and validate the site response", async () => {
  post.mockResolvedValue({
    data: { id: "b1181a76-7f7b-4a43-90ab-d8b966ea407b", name: "여행" },
  });
  const api = createTravelApi({ baseURL: "https://example.com/travel-api" });
  await api.getSite();
  expect(post).toHaveBeenCalledWith(
    "",
    { action: "site.get", input: { slug: "parents-travel" } },
    { headers: {} },
  );
  post.mockResolvedValue({ data: { id: "bad" } });
  await expect(api.getSite()).rejects.toThrow();
});
it("resolves the latest user token per call", async () => {
  post.mockResolvedValue({ data: {} });
  const getAccessToken = vi
    .fn()
    .mockResolvedValueOnce("first")
    .mockResolvedValueOnce("second");
  const api = createTravelApi({
    baseURL: "https://example.com/travel-api",
    getAccessToken,
  });
  await api.request("me");
  await api.request("me");
  expect(post.mock.calls[0]?.[2].headers.Authorization).toBe("Bearer first");
  expect(post.mock.calls[1]?.[2].headers.Authorization).toBe("Bearer second");
});
it("preserves version conflicts and request IDs without retrying a write", async () => {
  post.mockRejectedValue({
    isAxiosError: true,
    response: {
      status: 409,
      data: { error: "version_conflict", request_id: "req-1" },
    },
  });
  const api = createTravelApi({ baseURL: "https://example.com/travel-api" });
  await expect(api.request("admin.post.save")).rejects.toMatchObject<
    Partial<TravelApiError>
  >({ status: 409, code: "version_conflict", requestId: "req-1" });
  expect(post).toHaveBeenCalledTimes(1);
});
it("passes visitor credentials separately from authenticated bearer tokens", async () => {
  post.mockResolvedValue({ data: {} });
  const api = createTravelApi({
    baseURL: "/__mock__/functions/v1/travel-api",
    getVisitorToken: async () => "mock-visitor",
  });
  await api.request("like.set", { id: "post", liked: true });
  expect(post.mock.calls[0]?.[2].headers).toEqual({
    "X-Visitor-Token": "mock-visitor",
  });
});
