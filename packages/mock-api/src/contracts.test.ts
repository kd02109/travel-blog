import { expect, it } from "vitest";
import { createMockEngine } from "./engine";
import { databaseError } from "../../../supabase/functions/travel-api/core";
import { MOCK_SITE_ID, MOCK_POST_IDS, mockId } from "./fixtures";
import {
  actionContracts,
  apiErrorSchema,
  type ApiAction,
} from "@repo/contracts";
const site = { site_id: MOCK_SITE_ID };
const owner = { Authorization: "Bearer mock-owner" };
it("validates public/member/admin reads including nullable profile and audit fields", () => {
  const engine = createMockEngine();
  const cases: [ApiAction, Record<string, unknown>][] = [
    ["site.get", {}],
    ["posts.list", site],
    ["post.get", { ...site, id: MOCK_POST_IDS[0] }],
    ["comments.list", { id: MOCK_POST_IDS[0] }],
    ["me", {}],
    ["admin.posts", site],
    ["admin.post.get", { id: MOCK_POST_IDS[0] }],
    ["admin.members", site],
    ["admin.settings.get", site],
    ["admin.comments", site],
    ["admin.reports", site],
    ["admin.audit", site],
    ["admin.revisions", { id: MOCK_POST_IDS[0] }],
    ["asset.access", { id: mockId(4, 1) }],
    ["asset.status", { id: mockId(4, 1), ...site }],
  ];
  for (const [action, input] of cases) {
    const result = engine.handle({ action, input }, owner);
    expect(result.status).toBe(200);
    expect(
      actionContracts[action].output.safeParse(result.body).success,
      action,
    ).toBe(true);
  }
});
it("restricts asset status to staff of the selected site", () => {
  const engine = createMockEngine();
  const request = {
    action: "asset.status",
    input: { id: mockId(4, 1), ...site },
  };
  expect(engine.handle(request).status).toBe(401);
  expect(
    engine.handle(request, { Authorization: "Bearer mock-reader" }).status,
  ).toBe(403);
  expect(
    engine.handle(
      {
        action: "asset.status",
        input: { id: mockId(4, 1), site_id: mockId(1, 2) },
      },
      owner,
    ).status,
  ).toBe(403);
});
it("publishes an ordered home photo set and keeps draft-only photos private", () => {
  const engine = createMockEngine({ scenario: "empty" });
  const primary = mockId(4, 1);
  const secondary = mockId(4, 5);
  const settings = {
    template_id: "C",
    hero_asset_id: primary,
    hero_asset_ids: [primary, secondary],
  };
  const imageRequest = {
    action: "asset.access",
    input: { ...site, id: secondary },
  };
  expect(engine.handle(imageRequest).status).toBe(401);
  expect(
    engine.handle(
      {
        action: "admin.settings.save",
        input: { ...site, version: 1, settings },
      },
      owner,
    ).status,
  ).toBe(200);
  expect(engine.handle(imageRequest).status).toBe(401);
  expect(
    engine.handle(
      { action: "admin.settings.apply", input: { ...site, version: 2 } },
      owner,
    ).status,
  ).toBe(200);
  expect(engine.handle(imageRequest).status).toBe(200);
  expect(engine.handle({ action: "site.get", input: {} }).body).toMatchObject({
    settings,
  });
});
it("rejects invalid home photo arrays", () => {
  for (const hero_asset_ids of [
    [mockId(4, 1), mockId(4, 1)],
    Array.from({ length: 5 }, () => mockId(4, 1)),
    [mockId(4, 1), mockId(4, 6)],
  ]) {
    const result = createMockEngine().handle(
      {
        action: "admin.settings.save",
        input: {
          ...site,
          version: 1,
          settings: {
            template_id: "B",
            hero_asset_id: mockId(4, 1),
            hero_asset_ids,
          },
        },
      },
      owner,
    );
    expect(result.status).toBe(422);
  }
});
it("uses real status/error envelopes for denied, delayed, failed and conflicted scenarios", () => {
  for (const [scenario, status] of [
    ["empty", 200],
    ["slow", 200],
    ["error", 500],
    ["rate-limited", 429],
  ] as const) {
    const result = createMockEngine({ scenario }).handle({
      action: "posts.list",
      input: site,
    });
    expect(result.status).toBe(status);
    if (status !== 200)
      expect(apiErrorSchema.safeParse(result.body).success).toBe(true);
  }
  const engine = createMockEngine();
  expect(
    engine.handle({ action: "admin.posts", input: site }).body,
  ).toMatchObject({ error: "login_required" });
  expect(
    engine.handle(
      { action: "admin.posts", input: site },
      { Authorization: "Bearer mock-reader" },
    ).status,
  ).toBe(403);
  engine.failNext("admin.post.save", 409, "version_conflict");
  expect(
    engine.handle(
      {
        action: "admin.post.save",
        input: { id: MOCK_POST_IDS[0], version: 1, content: {} },
      },
      owner,
    ),
  ).toMatchObject({ status: 409, body: { error: "version_conflict" } });
});
it("filters admin posts by status, category and title/slug search before pagination", () => {
  const engine = createMockEngine();
  const all = engine.handle({ action: "admin.posts", input: site }, owner);
  expect(all.body).toHaveLength(8);
  const filtered = engine.handle(
    {
      action: "admin.posts",
      input: {
        ...site,
        status: "published",
        category: "food-cafe",
        search: "강릉",
      },
    },
    owner,
  );
  expect(filtered.body).toHaveLength(1);
  expect(filtered.body).toMatchObject([
    {
      category_code: "food-cafe",
      status: "published",
      title: "강릉 골목에서 만난 커피",
    },
  ]);
});
it("maps invalid PostgreSQL date input to the same safe API validation code", () => {
  expect(
    databaseError({ code: "22007", message: "sensitive database detail" }),
  ).toMatchObject({
    status: 422,
    message: "invalid_date",
  });
  expect(
    databaseError({ code: "PT422", message: "invalid_dates" }),
  ).toMatchObject({
    status: 422,
    message: "invalid_dates",
  });
  expect(
    databaseError({ code: "XX000", message: "sensitive database detail" }),
  ).toMatchObject({
    status: 500,
    message: "internal_error",
  });
});
