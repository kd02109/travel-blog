import { describe, expect, it } from "vitest";
import { createMockEngine } from "./engine";
import { renderBlocks } from "../../../supabase/functions/travel-api/core";
import {
  createFixtures,
  mockId,
  MOCK_POST_IDS,
  MOCK_SITE_ID,
} from "./fixtures";
import type { Post } from "./types";
const owner = { Authorization: "Bearer mock-owner" };
const reader = { Authorization: "Bearer mock-reader" };
const site = { site_id: MOCK_SITE_ID };
const first = MOCK_POST_IDS[0]!;
function call(
  engine: ReturnType<typeof createMockEngine>,
  action: string,
  input: Record<string, unknown> = {},
  headers: Record<string, string> = {},
) {
  return engine.handle({ action, input }, headers);
}
describe("public Supabase contract", () => {
  it("seeds the five Penpot categories without draft or body leaks", () => {
    const engine = createMockEngine();
    const list = call(engine, "posts.list", site).body as Record<
      string,
      unknown
    >[];
    expect(list).toHaveLength(5);
    expect(new Set(list.map((p) => p.category_code)).size).toBe(5);
    expect(list[0]).not.toHaveProperty("body_html");
    expect(list[0]).not.toHaveProperty("draft_content");
    expect(list.find((p) => p.category_code === "itinerary-pdf")).toMatchObject(
      { like_count: null, comment_count: null },
    );
    expect(call(engine, "post.get", { ...site, id: mockId(2, 6) }).status).toBe(
      404,
    );
  });
  it("filters and paginates; rejects malformed UUID and internal actions", () => {
    const engine = createMockEngine();
    expect(
      call(engine, "posts.list", { ...site, category: "day-walk", tag: "산책" })
        .body,
    ).toHaveLength(1);
    expect(
      call(engine, "posts.list", { ...site, limit: 2, offset: 2 }).body,
    ).toHaveLength(2);
    expect(call(engine, "post.get", { id: "invalid" }).status).toBe(400);
    expect(call(engine, "comment.credential", {}).status).toBe(400);
  });
  it("isolates snapshots and engines", () => {
    const a = createMockEngine(),
      b = createMockEngine();
    a.snapshot().posts[0]!.draft_content.title = "tamper";
    expect(b.snapshot()).toEqual(a.snapshot());
    a.reset("empty");
    expect(call(a, "posts.list", site).body).toEqual([]);
    expect(call(b, "posts.list", site).body).toHaveLength(5);
  });
});
describe("reader account lifecycle", () => {
  it("deduplicates deletion requests and anonymizes comments before completion", () => {
    const engine = createMockEngine();
    const firstRequest = call(engine, "account.delete.request", {}, reader);
    expect(firstRequest.status).toBe(200);
    expect(call(engine, "account.delete.request", {}, reader).body).toEqual(
      firstRequest.body,
    );
    const requestId = (firstRequest.body as { request_id: string }).request_id;
    expect(call(engine, "admin.account.deletions", site, reader).status).toBe(
      403,
    );
    expect(
      call(engine, "admin.account.deletions", site, owner).body,
    ).toMatchObject([{ id: requestId, status: "pending" }]);
    expect(
      call(
        engine,
        "admin.account.deletion.anonymize",
        { ...site, id: requestId },
        owner,
      ).body,
    ).toMatchObject({ status: "anonymized", comments_anonymized: 1 });
    expect(engine.snapshot().comments[0]).toMatchObject({
      author_id: null,
      author_kind: "anonymized",
      guest_name: null,
    });
    expect(
      call(
        engine,
        "admin.account.deletion.complete",
        { ...site, id: requestId },
        owner,
      ).status,
    ).toBe(409);
  });
});
describe("draft and published content", () => {
  it("previews body changes instead of the repeated heading", () => {
    const engine = createMockEngine();
    const draft = call(engine, "admin.post.get", { id: first }, owner)
      .body as Post;
    call(
      engine,
      "admin.post.save",
      {
        id: first,
        version: draft.lock_version,
        content: {
          ...draft.draft_content,
          blocks: [
            { type: "heading", content: [{ type: "text", text: "test 안녕" }] },
            {
              type: "paragraph",
              content: [{ type: "text", text: "수정된 본문" }],
            },
            { type: "image", props: { asset_id: mockId(4, 1) } },
            { type: "image", props: { asset_id: mockId(4, 2) } },
          ],
        },
        checkpoint: true,
      },
      owner,
    );
    const revisions = call(engine, "admin.revisions", { id: first }, owner)
      .body as { reason: string; excerpt: string }[];
    expect(
      revisions.find((revision) => revision.reason === "checkpoint")?.excerpt,
    ).toBe("수정된 본문 · 사진 2장");
  });
  it("renders paired images with only allowlisted layout attributes", () => {
    const image = (asset_id: string, props: Record<string, unknown>) => ({
      type: "image",
      props: { asset_id, ...props },
    });
    const rendered = renderBlocks([
      image(mockId(4, 1), { layout: "pair", width: "small", align: "left" }),
      image(mockId(4, 2), { layout: "pair", width: "medium", align: "right" }),
      image(mockId(4, 3), { layout: "pair", width: '" onload="x' }),
    ]);
    expect(rendered.html.match(/<div data-image-pair>/g)).toHaveLength(1);
    expect(rendered.html).toContain('data-image-width="small"');
    expect(rendered.html).toContain('data-image-align="right"');
    expect(rendered.html).not.toContain("onload");
    expect(rendered.assetIds).toHaveLength(3);
  });
  it("summarizes image-only checkpoints by photo count", () => {
    const engine = createMockEngine();
    const draft = call(engine, "admin.post.get", { id: first }, owner)
      .body as Post;
    call(
      engine,
      "admin.post.save",
      {
        id: first,
        version: draft.lock_version,
        content: {
          ...draft.draft_content,
          blocks: [
            { type: "image", props: { asset_id: mockId(4, 1) } },
            { type: "image", props: { asset_id: mockId(4, 2) } },
          ],
        },
        checkpoint: true,
      },
      owner,
    );
    const revisions = call(engine, "admin.revisions", { id: first }, owner)
      .body as { reason: string; excerpt: string }[];
    expect(
      revisions.find((revision) => revision.reason === "checkpoint")?.excerpt,
    ).toBe("사진 2장");
  });
  it("keeps the published snapshot until update and permanently removes only unreferenced history", () => {
    const engine = createMockEngine();
    const original = call(engine, "admin.post.published", { id: first }, owner)
      .body as { revision_id: string; snapshot: { title: string } };
    const draft = call(engine, "admin.post.get", { id: first }, owner)
      .body as Post;
    const changed = { ...draft.draft_content, title: "수정 초안" };
    const saved = call(
      engine,
      "admin.post.save",
      {
        id: first,
        version: draft.lock_version,
        content: changed,
        checkpoint: true,
      },
      owner,
    ).body as Post;
    expect(
      call(engine, "post.get", { ...site, id: first }).body,
    ).toHaveProperty("title", original.snapshot.title);
    expect(
      call(engine, "admin.post.published", { id: first }, owner).body,
    ).toMatchObject({
      revision_id: original.revision_id,
      snapshot: original.snapshot,
    });
    const repeated = call(
      engine,
      "admin.post.save",
      {
        id: first,
        version: saved.lock_version,
        content: changed,
        checkpoint: true,
      },
      owner,
    ).body as Post;
    const history = call(engine, "admin.revisions", { id: first }, owner)
      .body as {
      id: string;
      reason: string;
      title: string;
      is_published: boolean;
    }[];
    expect(history).toHaveLength(2);
    const checkpoint = history.find(
      (revision) => revision.reason === "checkpoint",
    )!;
    expect(checkpoint).toMatchObject({
      title: "수정 초안",
      is_published: false,
    });
    expect(
      call(
        engine,
        "admin.revision.get",
        {
          id: first,
          revision_id: checkpoint.id,
        },
        owner,
      ).body,
    ).toHaveProperty("snapshot.title", "수정 초안");
    expect(
      call(
        engine,
        "admin.revision.delete",
        {
          id: first,
          revision_id: original.revision_id,
          version: repeated.lock_version,
        },
        owner,
      ),
    ).toMatchObject({
      status: 409,
      body: { error: "published_revision_protected" },
    });
    expect(
      call(
        engine,
        "admin.revision.delete",
        {
          id: first,
          revision_id: checkpoint.id,
          version: repeated.lock_version - 1,
        },
        owner,
      ),
    ).toMatchObject({ status: 409, body: { error: "version_conflict" } });
    expect(
      call(
        engine,
        "admin.revision.delete",
        {
          id: first,
          site_id: mockId(1, 2),
          revision_id: checkpoint.id,
          version: repeated.lock_version,
        },
        owner,
      ),
    ).toMatchObject({ status: 403, body: { error: "forbidden" } });
    expect(
      call(
        engine,
        "admin.post.publish",
        {
          id: first,
          version: repeated.lock_version,
        },
        owner,
      ).body,
    ).toMatchObject({ revision_id: checkpoint.id });
    expect(
      call(engine, "post.get", { ...site, id: first }).body,
    ).toHaveProperty("title", "수정 초안");
    expect(
      call(
        engine,
        "admin.revision.delete",
        {
          id: first,
          revision_id: original.revision_id,
          version: repeated.lock_version + 1,
        },
        owner,
      ).body,
    ).toEqual({ deleted: true });
    expect(
      engine
        .snapshot()
        .revisions.some((revision) => revision.id === original.revision_id),
    ).toBe(false);
    expect(
      call(engine, "post.get", { ...site, id: first }).body,
    ).toHaveProperty("title", "수정 초안");
  });
  it("saves privately, rejects stale versions, publishes, then withdraws", () => {
    const engine = createMockEngine();
    const original = call(engine, "post.get", { ...site, id: first }).body;
    const draft = call(engine, "admin.post.get", { id: first }, owner)
      .body as Post;
    expect(
      call(
        engine,
        "admin.post.save",
        {
          id: first,
          version: 1,
          content: { ...draft.draft_content, title: "수정한 제목" },
          checkpoint: true,
        },
        owner,
      ).status,
    ).toBe(200);
    expect(call(engine, "post.get", { ...site, id: first }).body).toEqual(
      original,
    );
    expect(
      call(engine, "admin.post.publish", { id: first, version: 1 }, owner),
    ).toMatchObject({
      status: 409,
      body: { error: "version_conflict", request_id: expect.any(String) },
    });
    expect(
      call(engine, "admin.post.publish", { id: first, version: 2 }, owner).body,
    ).toMatchObject({ post_id: first, version: 3 });
    expect(
      call(engine, "post.get", { ...site, id: first }).body,
    ).toHaveProperty("title", "수정한 제목");
    expect(
      call(
        engine,
        "admin.post.status",
        { id: first, version: 3, status: "private" },
        owner,
      ).status,
    ).toBe(200);
    expect(call(engine, "post.get", { ...site, id: first }).status).toBe(404);
  });
  it("creates incomplete drafts at version zero and validates publishing", () => {
    const engine = createMockEngine();
    const created = call(
      engine,
      "admin.post.create",
      { ...site, kind: "article" },
      owner,
    ).body as Post;
    expect(created).toMatchObject({
      lock_version: 0,
      schema_version: 1,
      status: "draft",
    });
    expect(
      call(engine, "admin.post.publish", { id: created.id, version: 0 }, owner)
        .status,
    ).toBe(422);
    expect(
      call(
        engine,
        "admin.post.get",
        { site_id: mockId(1, 2), id: created.id },
        owner,
      ).status,
    ).toBe(403);
  });
  it.each([
    ["day-walk", { region: "서울", visited_on: "2026-02-30" }, "invalid_date"],
    [
      "overnight-trip",
      { region: "제주", start_date: "2026-09-20", end_date: "2026-09-20" },
      "invalid_dates",
    ],
    [
      "food-cafe",
      {
        region: "강릉",
        visited_on: "2026-09-18",
        place_name: "바다 카페",
        venue_type: "bar",
      },
      "invalid_venue",
    ],
    [
      "stay-review",
      {
        region: "제주",
        check_in: "2026-09-18",
        check_out: "2026-09-20",
        place_name: " ",
      },
      "missing_place",
    ],
  ] as const)(
    "enforces %s metadata on the publish endpoint",
    (category, metadata, error) => {
      const engine = createMockEngine();
      const content = {
        title: "분류 검증 글",
        slug: `metadata-check-${category}`,
        category_code: category,
        cover_asset_id: mockId(4, 1),
        blocks: [{ type: "paragraph", content: "여행 기록" }],
        metadata,
      };
      const draft = call(
        engine,
        "admin.post.create",
        { ...site, kind: "article", content },
        owner,
      ).body as Post;
      expect(
        call(engine, "admin.post.publish", { id: draft.id, version: 0 }, owner),
      ).toMatchObject({
        status: 422,
        body: { error },
      });
    },
  );
  it("restores a checkpoint without mutating the public revision", () => {
    const engine = createMockEngine();
    const draft = call(engine, "admin.post.get", { id: first }, owner)
      .body as Post;
    call(
      engine,
      "admin.post.save",
      {
        id: first,
        version: 1,
        content: { ...draft.draft_content, title: "체크포인트" },
        checkpoint: true,
      },
      owner,
    );
    const revisions = call(engine, "admin.revisions", { id: first }, owner)
      .body as { id: string }[];
    call(
      engine,
      "admin.post.save",
      {
        id: first,
        version: 2,
        content: { ...draft.draft_content, title: "이후 편집" },
      },
      owner,
    );
    const restored = call(
      engine,
      "admin.revision.restore",
      { id: first, version: 3, revision_id: revisions[0]!.id },
      owner,
    );
    expect(restored.body).toMatchObject({
      lock_version: 4,
      draft_content: { title: "체크포인트" },
    });
    expect(call(engine, "admin.revisions", { id: first }, owner).body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          reason: "before_restore",
          title: "이후 편집",
        }),
      ]),
    );
    expect(
      call(engine, "post.get", { ...site, id: first }).body,
    ).toHaveProperty("title", draft.draft_content.title);
  });
  it("uses the Edge renderer to reject unsafe blocks without partial publishing", () => {
    const engine = createMockEngine();
    const draft = call(engine, "admin.post.get", { id: first }, owner)
      .body as Post;
    call(
      engine,
      "admin.post.save",
      {
        id: first,
        version: 1,
        content: {
          ...draft.draft_content,
          blocks: [
            {
              type: "paragraph",
              content: [
                { type: "link", href: "javascript:alert(1)", content: [] },
              ],
            },
          ],
        },
      },
      owner,
    );
    expect(
      call(engine, "admin.post.publish", { id: first, version: 2 }, owner)
        .status,
    ).toBe(422);
    expect(engine.snapshot().posts[0]!.lock_version).toBe(2);
  });
});
describe("reactions and authorization", () => {
  it("requires explicit identities and enforces editor/owner permissions", () => {
    const engine = createMockEngine();
    expect(call(engine, "admin.posts", site).status).toBe(401);
    expect(
      call(engine, "admin.posts", site, { Authorization: "Bearer mock-reader" })
        .status,
    ).toBe(403);
    expect(
      call(engine, "admin.members", site, {
        Authorization: "Bearer mock-editor",
      }).status,
    ).toBe(403);
    expect(
      call(engine, "me", {}, { Authorization: "Bearer real-or-invalid" })
        .status,
    ).toBe(401);
    expect(
      call(
        engine,
        "admin.member.set",
        { ...site, user_id: mockId(3, 4), role: "editor", active: true },
        owner,
      ),
    ).toMatchObject({ status: 409, body: { error: "last_owner" } });
  });
  it("makes likes idempotent and refuses all PDF reactions", () => {
    const engine = createMockEngine();
    expect(call(engine, "like.get", { id: first }).status).toBe(401);
    expect(call(engine, "like.set", { id: first, liked: true }).status).toBe(
      401,
    );
    const visitor = call(engine, "visitor.create").body as {
      visitor_token: string;
    };
    const headers = { "X-Visitor-Token": visitor.visitor_token };
    expect(call(engine, "like.get", { id: first }, headers).body).toEqual({
      liked: false,
      count: 0,
    });
    expect(
      call(engine, "like.set", { id: first, liked: true }, headers).body,
    ).toEqual({ liked: true, count: 1 });
    expect(call(engine, "like.get", { id: first }, headers).body).toEqual({
      liked: true,
      count: 1,
    });
    expect(
      call(engine, "like.set", { id: first, liked: true }, headers).body,
    ).toEqual({ liked: true, count: 1 });
    expect(
      call(engine, "like.set", { id: first, liked: false }, headers).body,
    ).toEqual({ liked: false, count: 0 });
    expect(
      call(engine, "like.set", { id: MOCK_POST_IDS[4], liked: true }, headers)
        .status,
    ).toBe(403);
    expect(
      call(engine, "like.get", { id: MOCK_POST_IDS[4] }, headers).status,
    ).toBe(403);
    expect(
      call(engine, "comment.create", { id: MOCK_POST_IDS[4] }, headers).status,
    ).toBe(403);
  });
  it("protects guest credentials and enforces request-key and edit-version conflicts", () => {
    const engine = createMockEngine();
    const visitor = call(engine, "visitor.create").body as {
      visitor_token: string;
    };
    const headers = { "X-Visitor-Token": visitor.visitor_token };
    const input = {
      id: first,
      body: "예시 댓글을 작성합니다",
      request_key: mockId(6, 2),
      guest_name: "예시 독자",
      password: "mock-password",
    };
    const result = call(engine, "comment.create", input, headers).body as {
      id: string;
    };
    expect(call(engine, "comment.create", input, headers).body).toMatchObject({
      id: result.id,
      duplicate: true,
    });
    expect(
      call(engine, "comment.create", { ...input, body: "다른 내용" }, headers)
        .status,
    ).toBe(409);
    expect(
      JSON.stringify(call(engine, "comments.list", { id: first }).body),
    ).not.toContain("mock-password");
    expect(
      call(
        engine,
        "comment.edit",
        {
          id: result.id,
          version: 1,
          body: "수정",
          password: "wrong",
          guest_verified: true,
        },
        headers,
      ).status,
    ).toBe(403);
    expect(
      call(
        engine,
        "comment.edit",
        { id: result.id, version: 1, body: "수정", password: input.password },
        headers,
      ).status,
    ).toBe(200);
    expect(
      call(
        engine,
        "comment.delete",
        { id: result.id, version: 1, password: input.password },
        headers,
      ).status,
    ).toBe(409);
    expect(
      call(engine, "comment.delete", { id: result.id, version: 2 }, reader)
        .status,
    ).toBe(403);
    expect(
      call(
        engine,
        "comment.delete",
        { id: result.id, version: 2, password: input.password },
        reader,
      ).status,
    ).toBe(200);
  });
  it("rejects a different member editing someone else's comment", () => {
    const engine = createMockEngine();
    const created = call(
      engine,
      "comment.create",
      { id: first, body: "회원 댓글", request_key: mockId(6, 9) },
      reader,
    );
    expect(created.status).toBe(200);
    expect(
      call(
        engine,
        "comment.edit",
        {
          id: (created.body as { id: string }).id,
          version: 1,
          body: "가로채기",
        },
        owner,
      ).status,
    ).toBe(403);
    const commentId = (created.body as { id: string }).id;
    const ownerView = call(engine, "comments.list", { id: first }, reader)
      .body as { id: string; can_manage: boolean; is_guest: boolean }[];
    expect(ownerView.find((item) => item.id === commentId)).toMatchObject({
      can_manage: true,
      is_guest: false,
    });
    const otherView = call(engine, "comments.list", { id: first }, owner)
      .body as { id: string; can_manage: boolean; is_guest: boolean }[];
    expect(otherView.find((item) => item.id === commentId)?.can_manage).toBe(
      false,
    );
    expect(
      call(engine, "comment.delete", { id: commentId, version: 1 }, owner)
        .status,
    ).toBe(403);
    expect(
      call(engine, "comment.delete", { id: commentId, version: 1 }, reader)
        .status,
    ).toBe(200);
  });
  it("does not expose a post after an administrator makes it private", () => {
    const engine = createMockEngine();
    const draft = call(engine, "admin.post.get", { id: first }, owner)
      .body as Post;
    expect(
      call(
        engine,
        "admin.post.status",
        { id: first, version: draft.lock_version, status: "private" },
        owner,
      ).status,
    ).toBe(200);
    expect(call(engine, "post.get", { ...site, id: first }).status).toBe(404);
  });
  it("moderates visibility and retains deleted parents with visible replies", () => {
    const engine = createMockEngine();
    const parent = mockId(5, 1);
    call(
      engine,
      "comment.create",
      { id: first, parent_id: parent, body: "답글", request_key: mockId(6, 4) },
      owner,
    );
    expect(
      call(
        engine,
        "admin.comment.moderate",
        { ...site, id: parent, version: 1, status: "deleted" },
        owner,
      ).status,
    ).toBe(200);
    expect(call(engine, "comments.list", { id: first }).body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: parent, body: "", status: "deleted" }),
      ]),
    );
    expect(
      call(
        engine,
        "admin.comment.moderate",
        { ...site, id: parent, version: 2, status: "visible" },
        owner,
      ).status,
    ).toBe(422);
  });
});
describe("settings, assets, and failures", () => {
  it("keeps saved home settings private until applied", () => {
    const engine = createMockEngine();
    expect(
      call(
        engine,
        "admin.settings.save",
        { ...site, version: 1, settings: { template_id: "A" } },
        owner,
      ).body,
    ).toEqual({ version: 2 });
    expect(call(engine, "site.get").body).toMatchObject({
      settings: { template_id: "D" },
    });
    expect(
      call(engine, "admin.settings.apply", { ...site, version: 1 }, owner)
        .status,
    ).toBe(409);
    expect(
      call(engine, "admin.settings.apply", { ...site, version: 2 }, owner).body,
    ).toEqual({ version: 3 });
    expect(call(engine, "site.get").body).toMatchObject({
      settings: { template_id: "A" },
    });
  });
  it("exposes local sample assets and explicitly refuses unsupported uploads", () => {
    const engine = createMockEngine();
    const pdf = createFixtures().assets.find((a) => a.kind === "pdf")!;
    expect(call(engine, "asset.access", { id: pdf.id }).body).toMatchObject({
      url: "http://localhost:3000/mock-assets/itinerary.pdf",
      expires_in: 300,
      preview_asset_id: expect.any(String),
    });
    expect(
      call(engine, "asset.create", { ...site, kind: "pdf" }, owner),
    ).toMatchObject({
      status: 501,
      body: { error: "mock_upload_not_implemented" },
    });
  });
  it("injects one-shot failures and deterministic empty/error/rate-limit scenarios", () => {
    const engine = createMockEngine();
    engine.failNext("posts.list", 409, "version_conflict");
    expect(call(engine, "posts.list", site).status).toBe(409);
    expect(call(engine, "posts.list", site).status).toBe(200);
    engine.reset("error");
    expect(call(engine, "site.get").status).toBe(500);
    engine.reset("rate-limited");
    expect(call(engine, "site.get")).toMatchObject({
      status: 429,
      headers: { "Retry-After": "60" },
    });
    engine.reset("default");
    expect(call(engine, "posts.list", site).body).toHaveLength(5);
  });
});
