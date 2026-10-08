import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  actionContracts,
  parseActionOutput,
  type ApiAction,
  type ActionInput,
  type ActionOutput,
} from "./actions";
const id = "10000000-0000-4000-8000-000000000001";
const date = "2026-09-26T11:40:06.123456+00:00";
const draft = {
  id,
  site_id: id,
  author_id: id,
  kind: "article",
  status: "draft",
  draft_content: {},
  schema_version: 1,
  lock_version: 0,
  first_published_at: null,
  deleted_at: null,
  updated_at: date,
};
const card = {
  post_id: id,
  slug: "sample",
  title: "여행",
  category_code: "day-walk",
  tags: [],
  metadata: {},
  cover_asset_id: id,
  pdf_asset_id: null,
  published_at: date,
  updated_at: date,
  like_count: 0,
  comment_count: 0,
};
const profile = { user_id: id, display_name: "독자", avatar_asset_id: null };
const errorIssue = {
  id,
  site_id: id,
  app: "web",
  environment: "production",
  fingerprint: "a".repeat(64),
  status: "open",
  first_seen_at: date,
  last_seen_at: date,
  occurrence_count: 2,
  error_name: "TypeError",
  message: "render_boundary",
  route: "/posts/:id",
  source: "browser",
  release: "r1",
  request_id: id,
};
const errorContext = {
  operation: "post.render",
  dependency: "travel_api",
  http_status: 503,
  origin_request_id: id,
  stack_frames: [
    {
      function_name: "PostImage",
      file: "app/posts/id/page.tsx",
      line: 42,
      column: 18,
    },
  ],
};
// Synthetic values, shaped from the deployed SQL projection and Edge response.
const samples = {
  "site.get": {
    id,
    slug: "parents-travel",
    name: "오늘도 함께 걷다",
    settings: { template_id: "D" },
    version: 0,
  },
  "posts.list": [card],
  "post.get": {
    ...card,
    site_id: id,
    body_html: "<p>여행</p>",
    comments_enabled: true,
  },
  "comments.list": [
    {
      id,
      parent_id: null,
      body: "댓글",
      status: "visible",
      version: 0,
      created_at: date,
      updated_at: date,
      display_name: "독자",
      is_staff: false,
      can_manage: false,
      is_guest: true,
    },
  ],
  "like.get": { liked: false, count: 0 },
  "visitor.create": { visitor_token: "signed-visitor", expires_at: 1790419200 },
  "error.capture": { accepted: true },
  me: {
    user_id: id,
    profile,
    memberships: [{ site_id: id, role: "owner", name: "여행" }],
  },
  "profile.save": { saved: true },
  "account.delete.request": { requested: true, request_id: id },
  "comment.create": { id, version: 0, duplicate: false },
  "comment.edit": { id, version: 1 },
  "comment.delete": { id, version: 1 },
  "comment.report": { reported: true },
  "like.set": { liked: true, count: 1 },
  "admin.posts": [
    {
      id,
      kind: "article",
      status: "draft",
      category_code: "day-walk",
      title: null,
      published_slug: null,
      published_title: null,
      lock_version: 0,
      updated_at: date,
      first_published_at: null,
    },
  ],
  "admin.post.get": draft,
  "admin.post.published": {
    revision_id: id,
    snapshot: { title: "공개 글" },
    published_at: date,
    updated_at: date,
  },
  "admin.post.create": draft,
  "admin.post.save": draft,
  "admin.post.publish": { post_id: id, revision_id: id, version: 1 },
  "admin.post.status": { status: "private", version: 1 },
  "admin.revisions": [
    {
      id,
      created_at: date,
      created_by: id,
      schema_version: 1,
      reason: "published",
      post_version: 1,
      title: "공개 글",
      excerpt: "본문",
      is_published: true,
    },
  ],
  "admin.revision.get": {
    id,
    created_at: date,
    created_by: id,
    schema_version: 1,
    reason: "published",
    post_version: 1,
    title: "공개 글",
    excerpt: "본문",
    is_published: true,
    snapshot: { title: "공개 글" },
  },
  "admin.revision.restore": draft,
  "admin.revision.delete": { deleted: true },
  "admin.members": [
    {
      site_id: id,
      user_id: id,
      role: "owner",
      active: true,
      granted_by: null,
      created_at: date,
      updated_at: date,
    },
  ],
  "admin.member.set": { saved: true },
  "admin.settings.get": {
    draft: { template_id: "D" },
    published: { template_id: "D" },
    version: 0,
  },
  "admin.settings.save": { version: 1 },
  "admin.settings.apply": { version: 2 },
  "admin.comments": [
    {
      id,
      post_id: id,
      parent_id: null,
      body: "댓글",
      status: "visible",
      version: 0,
      created_at: date,
      author_kind: "guest",
      display_name: "독자",
      post_title: "여행 기록",
      is_staff: false,
      comments_enabled: true,
      open_reports: [],
    },
  ],
  "admin.comment.moderate": { version: 1 },
  "admin.account.deletions": [
    {
      id,
      user_id: id,
      email: "reader@example.invalid",
      status: "pending",
      requested_at: date,
      anonymized_at: null,
      completed_at: null,
    },
  ],
  "admin.account.deletion.anonymize": {
    status: "anonymized",
    comments_anonymized: 2,
  },
  "admin.account.deletion.complete": { status: "completed" },
  "admin.reports": [
    {
      id,
      comment_id: id,
      reporter_id: id,
      reason: "spam",
      status: "open",
      created_at: date,
    },
  ],
  "admin.report.resolve": { saved: true },
  "admin.audit": [
    {
      id,
      site_id: id,
      actor_id: null,
      action: "member.set",
      resource_id: id,
      changes: { role: "owner" },
      created_at: date,
    },
  ],
  "admin.errors": [errorIssue],
  "admin.error.get": {
    issue: {
      ...errorIssue,
      masked_message: "Cannot read properties of undefined",
      masked_stack:
        "TypeError: Cannot read properties of undefined\n  at render (page.tsx:42:7)",
      ...errorContext,
    },
    events: [
      {
        id,
        received_at: date,
        source: "browser",
        error_name: "TypeError",
        message: "render_boundary",
        route: "/posts/:id",
        release: "r1",
        request_id: id,
        masked_message: "Cannot read properties of undefined",
        masked_stack:
          "TypeError: Cannot read properties of undefined\n  at render (page.tsx:42:7)",
        ...errorContext,
      },
    ],
  },
  "asset.create": {
    id,
    bucket: "originals-private",
    upload_url: "https://example.com/upload",
    token: "signed-upload",
    path: "original",
  },
  "asset.complete": { id, state: "processing" },
  "asset.status": { id, state: "processing" },
  "asset.cancel": { saved: true },
  "asset.delete": { deleted: true },
  "asset.list": {
    items: [
      {
        id,
        created_at: date,
        metadata: { mime: "image/jpeg", bytes: 1024 },
        thumbnail_url: "https://example.com/thumbnail",
        original_url: "https://example.com/original",
        usage: ["home", "post-cover"],
        can_delete: false,
        delete_available_at: null,
        deletion_pending: false,
      },
    ],
    next_offset: null,
    expires_in: 300,
  },
  "asset.access": {
    id,
    url: "https://example.com/signed",
    expires_in: 300,
    metadata: {},
    preview_asset_id: null,
  },
} satisfies Record<ApiAction, unknown>;

describe("deployed action boundaries", () => {
  it("accepts bounded admin list filters and rejects unsupported statuses", () => {
    expect(
      actionContracts["admin.posts"].input.parse({
        site_id: id,
        category: "food-cafe",
        status: "published",
        search: " 강릉 ",
      }),
    ).toMatchObject({
      category: "food-cafe",
      status: "published",
      search: "강릉",
    });
    expect(
      actionContracts["admin.posts"].input.safeParse({
        site_id: id,
        status: "deleted",
      }).success,
    ).toBe(false);
    expect(
      actionContracts["admin.posts"].input.safeParse({
        site_id: id,
        search: "가".repeat(101),
      }).success,
    ).toBe(false);
  });
  it("bounds masked capture fields and requires a scoped detail lookup", () => {
    const capture = {
      app: "web" as const,
      environment: "preview" as const,
      source: "browser" as const,
      route: "/posts/:id",
      error_name: "TypeError",
      code: "render_boundary",
      digest: null,
      release: "r1",
      masked_message: "An error occurred",
      masked_stack: "TypeError: An error occurred\n  at render (page.tsx:42:7)",
      ...errorContext,
    };
    expect(
      actionContracts["error.capture"].input.safeParse(capture).success,
    ).toBe(true);
    expect(
      actionContracts["error.capture"].input.safeParse({
        ...capture,
        masked_message: "x".repeat(1025),
      }).success,
    ).toBe(false);
    expect(
      actionContracts["error.capture"].input.safeParse({
        ...capture,
        masked_stack: "x".repeat(4097),
      }).success,
    ).toBe(false);
    expect(
      actionContracts["error.capture"].input.safeParse({
        ...capture,
        stack_frames: [
          { ...errorContext.stack_frames[0], file: "https://host/path" },
        ],
      }).success,
    ).toBe(false);
    expect(
      actionContracts["error.capture"].input.safeParse({
        ...capture,
        stack_frames: [
          { ...errorContext.stack_frames[0], file: "unknown/private.js" },
        ],
      }).success,
    ).toBe(false);
    expect(
      actionContracts["error.capture"].input.safeParse({
        ...capture,
        stack_frames: [
          {
            ...errorContext.stack_frames[0],
            file: "apps/web/private@example.com.js",
          },
        ],
      }).success,
    ).toBe(false);
    expect(
      actionContracts["error.capture"].input.safeParse({
        ...capture,
        stack_frames: Array.from(
          { length: 11 },
          () => errorContext.stack_frames[0],
        ),
      }).success,
    ).toBe(false);
    expect(
      actionContracts["error.capture"].input.safeParse({
        ...capture,
        origin_request_id: "Bearer secret",
      }).success,
    ).toBe(false);
    expect(
      actionContracts["admin.error.get"].input.safeParse({ site_id: id, id })
        .success,
    ).toBe(true);
    expect(
      actionContracts["admin.error.get"].input.safeParse({ id }).success,
    ).toBe(false);
    expect(() =>
      parseActionOutput("admin.error.get", samples["admin.error.get"]),
    ).not.toThrow();
    expect(() =>
      parseActionOutput("admin.error.get", {
        ...samples["admin.error.get"],
        events: [
          {
            ...(
              samples["admin.error.get"] as {
                events: Record<string, unknown>[];
              }
            ).events[0],
            stack_frames: [
              {
                function_name: "PostImage",
                file: "https://example.com/private?token=secret",
                line: 42,
                column: 18,
              },
            ],
          },
        ],
      }),
    ).toThrow();
  });
  it("covers exactly the Edge allowlist, without internal-only actions", () => {
    const source = readFileSync(
      new URL(
        "../../../supabase/functions/travel-api/core.ts",
        import.meta.url,
      ),
      "utf8",
    );
    const prefix = source.slice(
      source.indexOf("export const publicActions"),
      source.indexOf("export function validateAction"),
    );
    const actions = [...prefix.matchAll(/"([a-z.]+)"/g)].map((m) => m[1]);
    expect(Object.keys(actionContracts).sort()).toEqual(actions.sort());
  });
  it("accepts a scoped asset status lookup and rejects malformed results", () => {
    const input = { id, site_id: id };
    expect(actionContracts["asset.status"].input.parse(input)).toEqual(input);
    expect(
      parseActionOutput("asset.status", { id, state: "processing" }),
    ).toEqual({ id, state: "processing" });
    expect(() =>
      parseActionOutput("asset.status", { id, state: "other" }),
    ).toThrow();
  });
  it("requires a site-scoped delete request and an explicit deletion result", () => {
    expect(
      actionContracts["asset.delete"].input.parse({ id, site_id: id }),
    ).toEqual({
      id,
      site_id: id,
    });
    expect(
      actionContracts["asset.delete"].input.safeParse({ id }).success,
    ).toBe(false);
    expect(
      actionContracts["asset.delete"].input.safeParse({
        id,
        site_id: id,
        force: true,
      }).success,
    ).toBe(false);
    expect(() =>
      parseActionOutput("asset.list", {
        ...samples["asset.list"],
        items: [{ ...samples["asset.list"].items[0], can_delete: undefined }],
      }),
    ).toThrow();
  });
  for (const action of Object.keys(samples) as ApiAction[]) {
    it(`accepts ${action} response and rejects a missing/wrong payload`, () => {
      expect(() => parseActionOutput(action, samples[action])).not.toThrow();
      if (action === "admin.post.published") {
        expect(parseActionOutput(action, null)).toBeNull();
      } else {
        expect(() => parseActionOutput(action, null)).toThrow();
      }
      expect(() => parseActionOutput(action, { unexpected: true })).toThrow();
    });
  }
  it("supports null profile, PDF reaction counts and deleted comment bodies", () => {
    expect(
      parseActionOutput("me", { ...samples.me, profile: null, memberships: [] })
        .profile,
    ).toBeNull();
    expect(
      parseActionOutput("posts.list", [
        {
          ...card,
          category_code: "itinerary-pdf",
          cover_asset_id: null,
          pdf_asset_id: id,
          like_count: null,
          comment_count: null,
        },
      ])[0]?.like_count,
    ).toBeNull();
    expect(
      parseActionOutput("comments.list", [
        { ...samples["comments.list"][0], body: "", status: "deleted" },
      ])[0]?.body,
    ).toBe("");
  });
  it("rejects missing version, spoofed server fields, invalid roles and unbounded offsets", () => {
    expect(
      actionContracts["admin.post.save"].input.safeParse({ id, content: {} })
        .success,
    ).toBe(false);
    expect(
      actionContracts["admin.post.publish"].input.safeParse({
        id,
        version: 0,
        rendered_html: "injected",
      }).success,
    ).toBe(false);
    expect(
      actionContracts["admin.member.set"].input.safeParse({
        site_id: id,
        user_id: id,
        role: "reader",
      }).success,
    ).toBe(false);
    expect(
      actionContracts["posts.list"].input.safeParse({
        site_id: id,
        offset: 100001,
      }).success,
    ).toBe(false);
    expect(
      actionContracts["admin.comments"].input.parse({ site_id: id }).filter,
    ).toBe("all");
    expect(
      actionContracts["admin.comments"].input.safeParse({
        site_id: id,
        filter: "invalid",
      }).success,
    ).toBe(false);
  });
  it("preserves incomplete JSON drafts and requires a post lookup selector", () => {
    expect(
      actionContracts["admin.post.create"].input.parse({
        site_id: id,
        kind: "article",
      }).content,
    ).toEqual({});
    expect(
      actionContracts["post.get"].input.safeParse({ site_id: id }).success,
    ).toBe(false);
  });
});

// These errors are verified by the package's tsc check; never executed.
function typeChecks() {
  // @ts-expect-error publishing always requires a version
  const missing: ActionInput<"admin.post.publish"> = { id };
  const wrong: ActionInput<"admin.member.set"> = {
    site_id: id,
    user_id: id,
    // @ts-expect-error regular reader is not a site membership role
    role: "reader",
  };
  const posts: ActionOutput<"posts.list"> = [];
  return { missing, wrong, posts };
}
void typeChecks;
