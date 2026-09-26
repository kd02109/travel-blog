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
    },
  ],
  "like.get": { liked: false, count: 0 },
  "visitor.create": { visitor_token: "signed-visitor", expires_at: 1790419200 },
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
      lock_version: 0,
      updated_at: date,
      first_published_at: null,
    },
  ],
  "admin.post.get": draft,
  "admin.post.create": draft,
  "admin.post.save": draft,
  "admin.post.publish": { post_id: id, revision_id: id, version: 1 },
  "admin.post.status": { status: "private", version: 1 },
  "admin.revisions": [
    { id, created_at: date, created_by: id, schema_version: 1 },
  ],
  "admin.revision.restore": draft,
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
  "asset.create": {
    id,
    bucket: "originals-private",
    upload_url: "https://example.com/upload",
    token: "signed-upload",
    path: "original",
  },
  "asset.complete": { id, state: "processing" },
  "asset.cancel": { saved: true },
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
  for (const action of Object.keys(samples) as ApiAction[]) {
    it(`accepts ${action} response and rejects a missing/wrong payload`, () => {
      expect(() => parseActionOutput(action, samples[action])).not.toThrow();
      expect(() => parseActionOutput(action, null)).toThrow();
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
