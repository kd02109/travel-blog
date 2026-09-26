import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  actionContracts,
  type ApiAction,
} from "../../packages/contracts/src/index";
import {
  createTravelApi,
  TravelApiError,
} from "../../packages/api-client/src/index";
import { createAppEnvironment } from "../../scripts/environment.mjs";
// Optional private read-only RPC samples from the management connector. These
// verify SQL response shapes, not end-user authentication or authorization.
if (process.env.TRAVEL_CONTRACT_SAMPLES) {
  const samples: Record<string, unknown> = JSON.parse(
    readFileSync(process.env.TRAVEL_CONTRACT_SAMPLES, "utf8"),
  );
  for (const [action, value] of Object.entries(samples)) {
    it(`management RPC sample: ${action}`, () => {
      expect(Object.hasOwn(actionContracts, action)).toBe(true);
      expect(
        actionContracts[action as ApiAction].output.safeParse(value).success,
      ).toBe(true);
    });
  }
}
// Opt-in network test. Only public reads and intentionally unauthorized reads.
// Does not create users, posts, reactions, uploads, or visitor tokens.
for (const app of ["web", "admin"]) {
  describe(`${app}: deployed travel-api contracts`, () => {
    const env = createAppEnvironment({
      root: process.cwd(),
      app,
      mode: "supabase",
    });
    const baseURL = `${env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/travel-api`;
    const api = createTravelApi({ baseURL });
    it("validates site/list and existing public detail if available", async () => {
      const site = await api.getSite();
      const posts = await api.listPosts({ site_id: site.id, limit: 1 });
      expect(Array.isArray(posts)).toBe(true);
      if (posts[0]) {
        const post = await api.getPost({
          site_id: site.id,
          id: posts[0].post_id,
        });
        expect(post.post_id).toBe(posts[0].post_id);
        await api.listComments({ id: post.post_id });
      }
    });
    it("returns 401 for anonymous member reads", async () => {
      await expect(api.getMe()).rejects.toMatchObject({
        status: 401,
        code: "login_required",
      });
    });
    it("returns 401 for invalid session tokens", async () => {
      const invalid = createTravelApi({
        baseURL,
        getAccessToken: async () => "invalid-contract-test-token",
      });
      await expect(invalid.getMe()).rejects.toMatchObject({
        status: 401,
        code: "invalid_session",
      });
    });
    it("returns a structured 404 for an absent site", async () => {
      try {
        await api.getSite(`contract-absent-${crypto.randomUUID()}`);
        throw new Error("unexpected success");
      } catch (error) {
        expect(error).toBeInstanceOf(TravelApiError);
        expect(error).toMatchObject({
          status: 404,
          code: "not_found",
          requestId: expect.any(String),
        });
      }
    });
  });
}

describe("SSR transport against the actual Supabase HTTP endpoint", () => {
  it("reads site and list using server fetch without Mirage", async () => {
    const { createServerReader } =
      await import("../../packages/api-client/src/server-transport");
    const env = createAppEnvironment({
      root: process.cwd(),
      app: "web",
      mode: "supabase",
    });
    const reader = createServerReader({
      baseURL: `${env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/travel-api`,
    });
    const site = await reader.getSite();
    expect(Array.isArray(await reader.listPosts({ site_id: site.id }))).toBe(
      true,
    );
  });
});
