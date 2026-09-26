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
      input: { ...site, status: "published", category: "food-cafe", search: "강릉" },
    },
    owner,
  );
  expect(filtered.body).toHaveLength(1);
  expect(filtered.body).toMatchObject([
    { category_code: "food-cafe", status: "published", title: "강릉 골목에서 만난 커피" },
  ]);
});
it("maps invalid PostgreSQL date input to the same safe API validation code", () => {
  expect(databaseError({ code: "22007", message: "sensitive database detail" })).toMatchObject({
    status: 422,
    message: "invalid_date",
  });
  expect(databaseError({ code: "PT422", message: "invalid_dates" })).toMatchObject({
    status: 422,
    message: "invalid_dates",
  });
  expect(databaseError({ code: "XX000", message: "sensitive database detail" })).toMatchObject({
    status: 500,
    message: "internal_error",
  });
});
