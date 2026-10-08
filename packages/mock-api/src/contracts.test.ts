import { expect, it } from "vitest";
import { createMockEngine } from "./engine";
import {
  databaseError,
  errorCaptureSqlInput,
} from "../../../supabase/functions/travel-api/core";
import { MOCK_SITE_ID, MOCK_POST_IDS, mockId } from "./fixtures";
import {
  actionContracts,
  apiErrorSchema,
  type ApiAction,
} from "@repo/contracts";
const site = { site_id: MOCK_SITE_ID };
const owner = { Authorization: "Bearer mock-owner" };
const admin = { Authorization: "Bearer mock-admin" };
it("passes only the SQL capture function's approved fields", () => {
  const payload = errorCaptureSqlInput(
    MOCK_SITE_ID,
    {
      app: "web",
      environment: "preview",
      source: "browser",
      route: "/posts/:id",
      error_name: "TypeError",
      code: "render_boundary",
      release: "r1",
      masked_message: "Cannot read properties of undefined",
      masked_stack:
        "TypeError: Cannot read properties of undefined\n    at render (page.tsx:42:7)",
    },
    "a".repeat(64),
    mockId(9, 1),
  );
  expect(Object.keys(payload).sort()).toEqual(
    [
      "site_id",
      "app",
      "environment",
      "source",
      "route",
      "error_name",
      "message",
      "masked_message",
      "masked_stack",
      "operation",
      "dependency",
      "http_status",
      "origin_request_id",
      "stack_frames",
      "fingerprint",
      "release",
      "request_id",
    ].sort(),
  );
  expect(payload.message).toBe("render_boundary");
  expect(payload.masked_message).toBe("Cannot read properties of undefined");
  expect(payload).toMatchObject({
    operation: null,
    dependency: null,
    http_status: null,
    origin_request_id: null,
    stack_frames: [],
  });
});
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
    ["admin.post.published", { id: MOCK_POST_IDS[0] }],
    ["admin.members", site],
    ["admin.settings.get", site],
    ["admin.comments", site],
    ["admin.reports", site],
    ["admin.audit", site],
    ["admin.revisions", { id: MOCK_POST_IDS[0] }],
    [
      "admin.revision.get",
      { id: MOCK_POST_IDS[0], revision_id: mockId(10, 1) },
    ],
    ["asset.access", { id: mockId(4, 1) }],
    ["asset.list", site],
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
it("restricts error issue reads to the active admin role", () => {
  const engine = createMockEngine();
  const request = { action: "admin.errors", input: site };
  expect(engine.handle(request).status).toBe(401);
  expect(engine.handle(request, owner).status).toBe(403);
  const listed = engine.handle(request, admin);
  expect(listed.status).toBe(200);
  expect(
    actionContracts["admin.errors"].output.safeParse(listed.body).success,
  ).toBe(true);
  expect(Array.isArray(listed.body) && listed.body).toHaveLength(1);
  const detailRequest = {
    action: "admin.error.get",
    input: { ...site, id: mockId(8, 1) },
  };
  expect(engine.handle(detailRequest).status).toBe(401);
  expect(
    engine.handle(detailRequest, { Authorization: "Bearer mock-editor" })
      .status,
  ).toBe(403);
  expect(engine.handle(detailRequest, owner).status).toBe(403);
  const detail = engine.handle(detailRequest, admin);
  expect(detail.status).toBe(200);
  expect(
    actionContracts["admin.error.get"].output.safeParse(detail.body).success,
  ).toBe(true);
  expect(detail.body).toMatchObject({
    issue: {
      id: mockId(8, 1),
      masked_message: expect.any(String),
      operation: "post.render",
      origin_request_id: mockId(8, 4),
      stack_frames: [{ file: "app/posts/id/page.tsx", line: 42 }],
    },
    events: [
      {
        masked_stack: expect.any(String),
        dependency: "travel_api",
        http_status: 503,
      },
    ],
  });
  expect(
    engine.handle(
      { ...detailRequest, input: { ...site, id: mockId(8, 10) } },
      admin,
    ).status,
  ).toBe(404);
  expect(
    createMockEngine({ scenario: "empty" }).handle(request, admin).body,
  ).toEqual([]);
  expect(
    createMockEngine({ scenario: "empty" }).handle(detailRequest, admin).status,
  ).toBe(404);
  expect(
    engine.handle(
      {
        action: "admin.member.set",
        input: { ...site, user_id: mockId(3, 3), role: "admin", active: false },
      },
      owner,
    ).status,
  ).toBe(200);
  expect(engine.handle(detailRequest, admin).status).toBe(403);
});
it("matches the error capture gateway's key, input and 202 response", () => {
  const engine = createMockEngine();
  const request = {
    action: "error.capture",
    input: {
      app: "web",
      environment: "preview",
      source: "browser",
      route: "/posts/:id",
      error_name: "TypeError",
      code: "render_boundary",
      digest: null,
      release: "r1",
      masked_message: "Cannot read properties of undefined",
      masked_stack:
        "TypeError: Cannot read properties of undefined\n    at render (page.tsx:42:7)",
      operation: "post.render",
      dependency: "travel_api",
      http_status: 503,
      origin_request_id: mockId(8, 4),
      stack_frames: [
        {
          function_name: "render",
          file: "app/posts/id/page.tsx",
          line: 42,
          column: 7,
        },
      ],
    },
  };
  expect(engine.handle(request).status).toBe(403);
  expect(engine.handle(request, { "X-Error-Report-Key": "wrong" }).status).toBe(
    403,
  );
  const key = { "X-Error-Report-Key": "mock-error-report-key" };
  expect(engine.handle(request, key)).toEqual(
    expect.objectContaining({ status: 202, body: { accepted: true } }),
  );
  expect(
    engine.handle(
      { ...request, input: { ...request.input, route: "/secret?token=x" } },
      key,
    ).status,
  ).toBe(400);
  expect(
    engine.handle(
      {
        ...request,
        input: { ...request.input, masked_stack: "x".repeat(4097) },
      },
      key,
    ).status,
  ).toBe(400);
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
      published_slug: "example-food-cafe",
    },
  ]);
});
it("keeps public post links and search tied to the active publication", () => {
  const engine = createMockEngine();
  const id = MOCK_POST_IDS[0];
  const original = engine.handle(
    { action: "admin.post.get", input: { id } },
    owner,
  );
  expect(original.status).toBe(200);
  const post = original.body as {
    lock_version: number;
    draft_content: Record<string, unknown>;
  };
  expect(
    engine.handle(
      {
        action: "admin.post.save",
        input: {
          id,
          version: post.lock_version,
          content: {
            ...post.draft_content,
            title: "아직 공개하지 않은 제목",
            slug: "unpublished-draft-address",
          },
        },
      },
      owner,
    ).status,
  ).toBe(200);

  for (const search of [
    "example-day-walk",
    "서울숲에서 천천히",
    "unpublished-draft-address",
  ]) {
    const result = engine.handle(
      { action: "admin.posts", input: { ...site, search } },
      owner,
    );
    expect(result.status).toBe(200);
    expect(result.body).toMatchObject([
      {
        id,
        title: "아직 공개하지 않은 제목",
        published_slug: "example-day-walk",
        published_title: "서울숲에서 천천히 걸었던 하루",
      },
    ]);
  }

  expect(
    engine.handle(
      {
        action: "admin.post.status",
        input: { id, version: post.lock_version + 1, status: "private" },
      },
      owner,
    ).status,
  ).toBe(200);
  const privateResult = engine.handle(
    { action: "admin.posts", input: { ...site, search: "서울숲에서 천천히" } },
    owner,
  );
  expect(privateResult.body).toEqual([]);
  const privateDraft = engine.handle(
    {
      action: "admin.posts",
      input: { ...site, search: "unpublished-draft-address" },
    },
    owner,
  );
  expect(privateDraft.body).toMatchObject([
    { id, published_slug: null, published_title: null },
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
