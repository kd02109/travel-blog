import { parseActionOutput, type ApiAction } from "@repo/contracts";
import { CATEGORIES } from "@repo/constants";
import { validatePublishedMetadata } from "@repo/contracts";
// These helpers are pure: use the same boundary validation and HTML renderer as Edge.
import {
  ApiError,
  cleanInput,
  memberActions,
  validateAction,
  renderBlocks,
  text,
} from "../../../supabase/functions/travel-api/core";
import {
  createFixtures,
  mockId,
  MOCK_NOW,
  MOCK_SITE,
  MOCK_SITE_ID,
  MOCK_TOKENS,
} from "./fixtures";
import type {
  Asset,
  Comment,
  Member,
  MockOptions,
  MockResult,
  Post,
  Role,
  Scenario,
  Settings,
} from "./types";
const roles = Object.keys(MOCK_TOKENS) as Role[];
const object = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new ApiError(400, "invalid_input");
  return value as Record<string, unknown>;
};
const requireVersion = (actual: number, expected: unknown) => {
  if (actual !== expected) throw new ApiError(409, "version_conflict");
};
const readText = (value: unknown, min: number, max: number) =>
  text(value, min, max).trim();
const paginate = <T>(items: T[], input: Record<string, unknown>) => {
  const limit = input.limit === undefined ? 12 : Number(input.limit);
  const offset = input.offset === undefined ? 0 : Number(input.offset);
  if (!Number.isInteger(limit) || !Number.isInteger(offset))
    throw new ApiError(400, "invalid_input");
  return items.slice(
    Math.min(100000, Math.max(0, offset)),
    Math.min(100000, Math.max(0, offset)) + Math.max(1, Math.min(50, limit)),
  );
};
export function createMockEngine(options: MockOptions = {}) {
  let scenario: Scenario = options.scenario ?? "default";
  let state = createFixtures(scenario === "empty");
  let sequence = 100;
  const now = options.now ?? (() => MOCK_NOW);
  const visitors = new Map<string, number>();
  const failures = new Map<string, { status: number; code: string }>();
  const id = () => mockId(9, ++sequence);
  function publicPost(postId: unknown) {
    return state.posts.find((p) => p.id === postId && p.status === "published");
  }
  function publication(postId: unknown) {
    return publicPost(postId)
      ? state.publications.find((p) => p.post_id === postId)
      : undefined;
  }
  const sameContent = (left: unknown, right: unknown) =>
    JSON.stringify(left) === JSON.stringify(right);
  function revisionSummary(revision: (typeof state.revisions)[number]) {
    const bodyParts: string[] = [];
    let photoCount = 0;
    function visit(block: unknown) {
      if (!block || typeof block !== "object") return;
      const item = block as {
        type?: unknown;
        content?: unknown;
        children?: unknown;
      };
      if (item.type === "image") photoCount++;
      if (
        bodyParts.length < 2 &&
        [
          "paragraph",
          "bulletListItem",
          "numberedListItem",
          "quote",
          "codeBlock",
        ].includes(String(item.type))
      ) {
        const bodyText =
          typeof item.content === "string"
            ? item.content
            : Array.isArray(item.content)
              ? item.content
                  .filter(
                    (part): part is { text: string } =>
                      !!part &&
                      typeof part === "object" &&
                      (part as { type?: unknown }).type === "text" &&
                      typeof (part as { text?: unknown }).text === "string",
                  )
                  .map((part) => part.text)
                  .join("")
              : "";
        if (bodyText.trim()) bodyParts.push(bodyText.trim());
      }
      if (Array.isArray(item.children)) item.children.forEach(visit);
    }
    revision.snapshot.blocks?.forEach(visit);
    const bodyText = bodyParts.join(" · ");
    const excerpt = bodyText
      ? `${bodyText.slice(0, photoCount ? 110 : 140)}${photoCount ? ` · 사진 ${photoCount}장` : ""}`
      : photoCount
        ? `사진 ${photoCount}장`
        : "본문 없음";
    return {
      id: revision.id,
      created_at: revision.created_at,
      created_by: revision.created_by,
      schema_version: revision.schema_version,
      reason: revision.reason,
      post_version: revision.post_version,
      title: revision.snapshot.title ?? "",
      excerpt,
      is_published: state.publications.some(
        (published) => published.revision_id === revision.id,
      ),
    };
  }
  function counts(postId: string) {
    const post = state.posts.find((p) => p.id === postId)!;
    return {
      like_count:
        post.kind === "pdf" ? null : (state.likes[postId] ?? []).length,
      comment_count:
        post.kind === "pdf"
          ? null
          : state.comments.filter(
              (c) => c.post_id === postId && c.status === "visible",
            ).length,
    };
  }
  function member(headers: Record<string, string>) {
    if (
      headers.authorization &&
      !/^Bearer [^\s]+$/i.test(headers.authorization)
    )
      throw new ApiError(401, "invalid_authorization");
    const token = headers.authorization?.replace(/^Bearer /i, "");
    if (!token) return undefined;
    const index = roles.findIndex((role) => MOCK_TOKENS[role] === token);
    const person = state.members.find(
      (m) => m.user_id === mockId(3, index + 1),
    );
    if (!person) throw new ApiError(401, "invalid_session");
    return person;
  }
  function staff(
    person: Member | undefined,
    allowed: Role[] = ["editor", "admin", "owner"],
  ) {
    if (!person) throw new ApiError(401, "login_required");
    if (!person.active || !allowed.includes(person.role))
      throw new ApiError(403, "forbidden");
    return person;
  }
  function checkSite(value: unknown, required = false) {
    if (
      (required && value === undefined) ||
      (value !== undefined && value !== MOCK_SITE_ID)
    )
      throw new ApiError(403, "forbidden");
  }
  function reactionActor(
    person: Member | undefined,
    headers: Record<string, string>,
  ) {
    if (person) return person.user_id;
    const visitor = headers["x-visitor-token"];
    if (!visitor) throw new ApiError(401, "visitor_required");
    if ((visitors.get(visitor) ?? 0) <= Date.parse(now()) / 1000)
      throw new ApiError(401, "invalid_visitor");
    return visitor;
  }
  function publicComment(c: Comment, viewerId?: string) {
    return {
      id: c.id,
      parent_id: c.parent_id,
      body: c.status === "deleted" ? "" : c.body,
      status: c.status,
      version: c.version,
      created_at: c.created_at,
      updated_at: c.updated_at,
      display_name:
        c.status === "deleted"
          ? "삭제된 사용자"
          : (state.members.find((m) => m.user_id === c.author_id)
              ?.display_name ??
            c.guest_name ??
            "독자"),
      is_staff: state.members.some(
        (m) => m.user_id === c.author_id && m.active && m.role !== "reader",
      ),
      can_manage:
        c.status === "visible" &&
        c.author_kind === "member" &&
        c.author_id === viewerId,
      is_guest: c.status === "visible" && c.author_kind === "guest",
    };
  }
  function audit(person: Member, action: string, resource: string) {
    state.audit.unshift({
      id: id(),
      site_id: MOCK_SITE_ID,
      actor_id: person.user_id,
      action,
      resource_id: resource,
      changes: {},
      created_at: now(),
    });
  }
  function readyAsset(assetId: unknown, kind: Asset["kind"]) {
    return state.assets.find(
      (a) => a.id === assetId && a.kind === kind && a.state === "ready",
    );
  }
  function assetReferenced(assetId: string) {
    const containsId = (value: unknown) =>
      JSON.stringify(value).includes(assetId);
    return (
      state.assets.some((asset) => asset.preview_asset_id === assetId) ||
      state.posts.some((post) => containsId(post.draft_content)) ||
      state.revisions.some((revision) => containsId(revision.snapshot)) ||
      state.publications.some((publication) => containsId(publication)) ||
      containsId(state.draftSettings) ||
      containsId(state.publishedSettings)
    );
  }
  function deleteAvailableAt(asset: Asset) {
    const availableAt = Date.parse(asset.created_at) + 125 * 60 * 1000;
    return availableAt > Date.parse(now())
      ? new Date(availableAt).toISOString()
      : null;
  }
  function validateSettings(input: unknown): Settings {
    const value = object(input);
    if (
      Object.keys(value).some(
        (k) =>
          ![
            "template_id",
            "title",
            "description",
            "hero_asset_id",
            "hero_asset_ids",
            "featured_post_id",
          ].includes(k),
      )
    )
      throw new ApiError(422, "invalid_settings");
    if (!["A", "B", "C", "D"].includes(String(value.template_id)))
      throw new ApiError(422, "invalid_settings");
    if (value.title !== undefined) readText(value.title, 1, 150);
    if (
      value.description !== undefined &&
      (typeof value.description !== "string" || value.description.length > 500)
    )
      throw new ApiError(422, "invalid_text");
    if (value.hero_asset_id && !readyAsset(value.hero_asset_id, "image"))
      throw new ApiError(422, "invalid_asset");
    if (value.hero_asset_ids !== undefined) {
      if (
        !Array.isArray(value.hero_asset_ids) ||
        value.hero_asset_ids.length > 4 ||
        value.hero_asset_ids.some((assetId) => typeof assetId !== "string") ||
        new Set(value.hero_asset_ids).size !== value.hero_asset_ids.length
      )
        throw new ApiError(422, "invalid_settings");
      for (const assetId of value.hero_asset_ids) {
        if (!readyAsset(assetId, "image"))
          throw new ApiError(422, "invalid_asset");
      }
      if (
        value.hero_asset_ids.length > 0 &&
        value.hero_asset_id !== value.hero_asset_ids[0]
      )
        throw new ApiError(422, "invalid_settings");
    }
    if (value.featured_post_id && !publication(value.featured_post_id))
      throw new ApiError(422, "invalid_featured_post");
    return structuredClone(value) as Settings;
  }
  function validatePublication(post: Post) {
    const d = post.draft_content;
    const m = d.metadata ?? {};
    if (
      post.status === "trashed" ||
      typeof d.title !== "string" ||
      !d.title.trim() ||
      d.title.trim().length > 150 ||
      !/^[a-z0-9][a-z0-9-]{0,119}$/.test(d.slug ?? "")
    )
      throw new ApiError(422, "invalid_title_or_slug");
    if (!CATEGORIES.some((c) => c.code === d.category_code))
      throw new ApiError(422, "invalid_category");
    if (
      d.tags &&
      (!Array.isArray(d.tags) ||
        d.tags.length > 20 ||
        d.tags.some(
          (t) => typeof t !== "string" || !t.trim() || t.trim().length > 30,
        ))
    )
      throw new ApiError(422, "invalid_tags");
    if (
      state.publications.some((p) => p.post_id !== post.id && p.slug === d.slug)
    )
      throw new ApiError(409, "slug_conflict");
    if (post.kind === "pdf") {
      if (d.category_code !== "itinerary-pdf")
        throw new ApiError(422, "invalid_category");
      const asset = readyAsset(d.pdf_asset_id, "pdf");
      if (
        !asset ||
        !readyAsset(asset.preview_asset_id, "image") ||
        Number(asset.metadata.page_count) < 1 ||
        Number(asset.metadata.page_count) > 200
      )
        throw new ApiError(422, "pdf_not_ready");
      return { html: null };
    }
    if (d.category_code === "itinerary-pdf" || !d.blocks?.length || !m.region)
      throw new ApiError(422, "incomplete_article");
    if (!readyAsset(d.cover_asset_id, "image"))
      throw new ApiError(422, "cover_not_ready");
    const metadataError = validatePublishedMetadata(
      d.category_code as Exclude<
        (typeof CATEGORIES)[number]["code"],
        "itinerary-pdf"
      >,
      m,
    );
    if (metadataError) throw new ApiError(422, metadataError);
    const rendered = renderBlocks(d.blocks);
    if (rendered.assetIds.some((assetId) => !readyAsset(assetId, "image")))
      throw new ApiError(422, "invalid_asset");
    return rendered;
  }
  function dispatch(
    action: string,
    input: Record<string, unknown>,
    headers: Record<string, string>,
  ): unknown {
    const person = member(headers);
    if (action === "site.get") {
      if (
        (input.site_id && input.site_id !== MOCK_SITE_ID) ||
        (!input.site_id && input.slug && input.slug !== MOCK_SITE.slug)
      )
        throw new ApiError(404, "not_found");
      return {
        ...MOCK_SITE,
        settings: state.publishedSettings,
        version: state.settingsVersion,
      };
    }
    if (action === "posts.list") {
      if (input.site_id !== MOCK_SITE_ID) return [];
      const list = state.publications
        .filter(
          (p) =>
            publicPost(p.post_id) &&
            (!input.category || p.category_code === input.category) &&
            (!input.tag || p.tags.includes(String(input.tag))),
        )
        .sort(
          (a, b) =>
            b.published_at.localeCompare(a.published_at) ||
            a.post_id.localeCompare(b.post_id),
        );
      return paginate(list, input).map((p) => {
        const { site_id, body_html, comments_enabled, ...card } = p;
        void site_id;
        void body_html;
        void comments_enabled;
        return { ...card, ...counts(p.post_id) };
      });
    }
    if (action === "post.get") {
      const p = state.publications.find(
        (p) =>
          p.site_id === input.site_id &&
          (input.id ? p.post_id === input.id : p.slug === input.slug) &&
          publicPost(p.post_id),
      );
      if (!p) throw new ApiError(404, "not_found");
      return { ...p, ...counts(p.post_id) };
    }
    if (action === "comments.list") {
      if (!publication(input.id)) throw new ApiError(404, "not_found");
      return paginate(
        state.comments
          .filter(
            (c) =>
              c.post_id === input.id &&
              (c.status === "visible" ||
                (c.status === "deleted" &&
                  state.comments.some(
                    (r) => r.parent_id === c.id && r.status === "visible",
                  ))),
          )
          .sort(
            (a, b) =>
              a.created_at.localeCompare(b.created_at) ||
              a.id.localeCompare(b.id),
          ),
        input,
      ).map((comment) => publicComment(comment, person?.user_id));
    }
    if (action === "visitor.create") {
      const token = `mock-visitor-${id()}`;
      visitors.set(token, Math.floor(Date.parse(now()) / 1000) + 2592000);
      return {
        visitor_token: token,
        expires_at: Math.floor(Date.parse(now()) / 1000) + 2592000,
      };
    }
    if (action === "me" || action === "profile.save") {
      if (!person) throw new ApiError(401, "login_required");
      if (action === "profile.save") {
        person.display_name = readText(input.display_name, 2, 30);
        return { saved: true };
      }
      return {
        user_id: person.user_id,
        profile: {
          user_id: person.user_id,
          display_name: person.display_name,
          avatar_asset_id: null,
        },
        memberships:
          person.active && person.role !== "reader"
            ? [
                {
                  site_id: MOCK_SITE_ID,
                  role: person.role,
                  name: MOCK_SITE.name,
                },
              ]
            : [],
      };
    }
    if (action === "account.delete.request") {
      if (!person) throw new ApiError(401, "login_required");
      let request = state.accountDeletions.find(
        (item) =>
          item.user_id === person.user_id && item.status !== "completed",
      );
      if (!request) {
        request = {
          id: id(),
          user_id: person.user_id,
          email: "reader@example.invalid",
          status: "pending",
          requested_at: now(),
          anonymized_at: null,
          completed_at: null,
        };
        state.accountDeletions.unshift(request);
      }
      return { requested: true, request_id: request.id };
    }
    if (action === "like.get" || action === "like.set") {
      const p = publication(input.id);
      if (!p || p.category_code === "itinerary-pdf")
        throw new ApiError(403, "reactions_unavailable");
      const actor = reactionActor(person, headers);
      const likes = new Set(state.likes[p.post_id] ?? []);
      if (action === "like.get")
        return { liked: likes.has(actor), count: likes.size };
      if (typeof input.liked !== "boolean")
        throw new ApiError(422, "invalid_input");
      if (input.liked) likes.add(actor);
      else likes.delete(actor);
      state.likes[p.post_id] = [...likes];
      return { liked: input.liked, count: likes.size };
    }
    if (action === "comment.create") {
      const p = publication(input.id);
      if (!p || !p.comments_enabled || p.category_code === "itinerary-pdf")
        throw new ApiError(403, "comments_unavailable");
      const actor = reactionActor(person, headers);
      const body = readText(input.body, 1, 1000);
      if (typeof input.request_key !== "string")
        throw new ApiError(422, "request_key_required");
      const guest = person ? null : readText(input.guest_name, 2, 30);
      const password = person ? undefined : text(input.password, 8, 128);
      if (
        input.parent_id &&
        !state.comments.some(
          (c) =>
            c.id === input.parent_id &&
            c.post_id === p.post_id &&
            c.parent_id === null &&
            c.status === "visible",
        )
      )
        throw new ApiError(422, "invalid_reply");
      const fingerprint = JSON.stringify([
        body,
        input.parent_id ?? null,
        guest,
      ]);
      const existing = state.comments.find(
        (c) =>
          c.post_id === p.post_id &&
          c.actor === actor &&
          c.request_key === input.request_key,
      );
      if (existing) {
        if (existing.fingerprint !== fingerprint)
          throw new ApiError(409, "idempotency_conflict");
        return { id: existing.id, version: existing.version, duplicate: true };
      }
      const comment: Comment = {
        id: id(),
        post_id: p.post_id,
        parent_id: (input.parent_id as string) ?? null,
        body,
        status: "visible",
        version: 1,
        created_at: now(),
        updated_at: now(),
        author_id: person?.user_id ?? null,
        author_kind: person ? "member" : "guest",
        guest_name: guest,
        password,
        actor,
        request_key: input.request_key,
        fingerprint,
      };
      state.comments.push(comment);
      return { id: comment.id, version: 1, duplicate: false };
    }
    if (
      action === "comment.edit" ||
      action === "comment.delete" ||
      action === "comment.report"
    ) {
      const c = state.comments.find((c) => c.id === input.id);
      if (!c || c.status === "deleted" || !publication(c.post_id))
        throw new ApiError(404, "not_found");
      if (action === "comment.report") {
        if (c.status !== "visible") throw new ApiError(404, "not_found");
        if (!person) throw new ApiError(401, "login_required");
        if (
          !["spam", "abuse", "personal_information", "other"].includes(
            String(input.reason),
          )
        )
          throw new ApiError(422, "invalid_reason");
        if (
          !state.reports.some(
            (r) => r.comment_id === c.id && r.reporter_id === person.user_id,
          )
        )
          state.reports.push({
            id: id(),
            comment_id: c.id,
            reporter_id: person.user_id,
            reason: String(input.reason),
            status: "open",
            created_at: now(),
          });
        return { reported: true };
      }
      reactionActor(person, headers);
      if (
        c.author_kind === "member"
          ? c.author_id !== person?.user_id
          : c.password !== input.password
      )
        throw new ApiError(
          403,
          c.author_kind === "guest" ? "invalid_password" : "forbidden",
        );
      requireVersion(c.version, input.version);
      c.body = action === "comment.delete" ? "" : readText(input.body, 1, 1000);
      if (action === "comment.delete") c.status = "deleted";
      c.version++;
      c.updated_at = now();
      return { id: c.id, version: c.version };
    }
    if (action === "asset.access") {
      const asset = state.assets.find((a) => a.id === input.id);
      if (!asset) throw new ApiError(404, "not_found");
      checkSite(input.site_id);
      const linked =
        state.publications.some(
          (p) =>
            publicPost(p.post_id) &&
            (p.cover_asset_id === asset.id ||
              p.pdf_asset_id === asset.id ||
              state.assets.some(
                (pdf) =>
                  pdf.id === p.pdf_asset_id &&
                  pdf.preview_asset_id === asset.id,
              )),
        ) ||
        state.publishedSettings.hero_asset_id === asset.id ||
        state.publishedSettings.hero_asset_ids?.includes(asset.id) === true;
      if (asset.state !== "ready" || !linked) staff(person);
      return {
        id: asset.id,
        url: new URL(asset.url, options.origin ?? "http://localhost:3000").href,
        expires_in: 300,
        metadata: asset.metadata,
        preview_asset_id: asset.preview_asset_id,
      };
    }
    if (action === "asset.delete") {
      checkSite(input.site_id, true);
      const actor = staff(person, ["admin", "owner"]);
      const index = state.assets.findIndex((asset) => asset.id === input.id);
      const asset = state.assets[index];
      if (!asset) throw new ApiError(404, "not_found");
      if (asset.kind !== "image" || asset.state !== "ready")
        throw new ApiError(409, "asset_not_deletable");
      if (deleteAvailableAt(asset))
        throw new ApiError(409, "asset_upload_token_active");
      if (assetReferenced(asset.id)) throw new ApiError(409, "asset_in_use");
      state.assets.splice(index, 1);
      audit(actor, action, asset.id);
      return { deleted: true };
    }
    if (action === "asset.list") {
      const actor = staff(person);
      checkSite(input.site_id, true);
      void actor;
      const limit = Math.max(
        1,
        Math.min(50, input.limit === undefined ? 12 : Number(input.limit)),
      );
      const offset = Math.max(
        0,
        Math.min(100000, input.offset === undefined ? 0 : Number(input.offset)),
      );
      const usedInHome = new Set(
        [
          state.draftSettings.hero_asset_id,
          state.draftSettings.hero_asset_ids,
          state.publishedSettings.hero_asset_id,
          state.publishedSettings.hero_asset_ids,
        ].flatMap((value) =>
          Array.isArray(value) ? value : value ? [value] : [],
        ),
      );
      const usedAsCover = new Set(
        state.publications.flatMap((publication) =>
          publication.cover_asset_id ? [publication.cover_asset_id] : [],
        ),
      );
      const usedInBody = new Set<string>();
      for (const post of state.posts) {
        const blocks = post.draft_content.blocks ?? [];
        const visit = (value: unknown) => {
          if (!value || typeof value !== "object") return;
          const item = value as {
            type?: unknown;
            props?: unknown;
            children?: unknown;
          };
          if (
            item.type === "image" &&
            item.props &&
            typeof item.props === "object"
          ) {
            const assetId = (item.props as { asset_id?: unknown }).asset_id;
            if (typeof assetId === "string") usedInBody.add(assetId);
          }
          if (Array.isArray(item.children)) item.children.forEach(visit);
        };
        blocks.forEach(visit);
      }
      const kind = input.kind ?? "image";
      const libraryAssets = state.assets
        .filter(
          (asset) =>
            asset.kind === kind &&
            asset.state === "ready" &&
            (kind !== "pdf" ||
              state.assets.some(
                (preview) =>
                  preview.id === asset.preview_asset_id &&
                  preview.kind === "image" &&
                  preview.state === "ready",
              )),
        )
        .sort(
          (left, right) =>
            (right.created_at ?? MOCK_NOW).localeCompare(
              left.created_at ?? MOCK_NOW,
            ) || left.id.localeCompare(right.id),
        );
      const page = libraryAssets.slice(offset, offset + limit);
      return {
        items: page.map((asset) => ({
          id: asset.id,
          created_at: asset.created_at ?? MOCK_NOW,
          metadata: asset.metadata,
          preview_asset_id: kind === "pdf" ? asset.preview_asset_id : null,
          thumbnail_url: new URL(
            kind === "pdf"
              ? state.assets.find((item) => item.id === asset.preview_asset_id)!
                  .url
              : asset.url,
            options.origin ?? "http://localhost:3000",
          ).href,
          original_url: new URL(
            asset.url,
            options.origin ?? "http://localhost:3000",
          ).href,
          usage:
            kind === "pdf"
              ? state.publications.some(
                  (publication) => publication.pdf_asset_id === asset.id,
                ) ||
                state.posts.some(
                  (post) => post.draft_content.pdf_asset_id === asset.id,
                )
                ? ["post-pdf"]
                : []
              : [
                  ...(usedInHome.has(asset.id) ? ["home"] : []),
                  ...(usedAsCover.has(asset.id) ? ["post-cover"] : []),
                  ...(usedInBody.has(asset.id) ? ["post-body"] : []),
                ],
          can_delete:
            kind === "image" &&
            !assetReferenced(asset.id) &&
            !deleteAvailableAt(asset),
          delete_available_at:
            kind === "image" ? deleteAvailableAt(asset) : null,
          deletion_pending: false,
        })),
        next_offset: page.length === limit ? offset + limit : null,
        expires_in: 300,
      };
    }
    if (action === "asset.status") {
      const asset = state.assets.find((a) => a.id === input.id);
      if (!asset) throw new ApiError(404, "not_found");
      checkSite(input.site_id);
      staff(person);
      return { id: asset.id, state: asset.state };
    }
    // Binary uploads and workers are deliberately not fake-success endpoints.
    if (action === "asset.create" || action === "asset.complete") {
      staff(person);
      throw new ApiError(501, "mock_upload_not_implemented");
    }
    if (action.startsWith("admin.")) {
      const actor = staff(person);
      const scopedPost = [
        "admin.post.get",
        "admin.post.published",
        "admin.post.save",
        "admin.post.publish",
        "admin.post.status",
        "admin.revisions",
        "admin.revision.get",
        "admin.revision.restore",
        "admin.revision.delete",
      ].includes(action);
      checkSite(input.site_id, !scopedPost);
      if (action === "admin.posts") {
        const validStatuses = ["draft", "published", "private", "trashed"];
        if (
          input.status !== undefined &&
          !validStatuses.includes(String(input.status))
        )
          throw new ApiError(422, "invalid_status");
        const search =
          typeof input.search === "string"
            ? input.search.trim().toLocaleLowerCase()
            : "";
        const filtered = state.posts.filter((post) => {
          const category = post.draft_content.category_code ?? null;
          const published = publication(post.id);
          return (
            (!input.status || post.status === input.status) &&
            (!input.category || category === input.category) &&
            (!search ||
              `${post.draft_content.title ?? ""} ${post.draft_content.slug ?? ""} ${published?.title ?? ""} ${published?.slug ?? ""}`
                .toLocaleLowerCase()
                .includes(search))
          );
        });
        return paginate(
          filtered.sort(
            (a, b) =>
              b.updated_at.localeCompare(a.updated_at) ||
              a.id.localeCompare(b.id),
          ),
          input,
        ).map((p) => ({
          id: p.id,
          kind: p.kind,
          status: p.status,
          category_code: p.draft_content.category_code ?? null,
          title: p.draft_content.title ?? null,
          published_slug: publication(p.id)?.slug ?? null,
          published_title: publication(p.id)?.title ?? null,
          lock_version: p.lock_version,
          updated_at: p.updated_at,
          first_published_at: p.first_published_at,
        }));
      }
      if (action === "admin.post.create") {
        if (!["article", "pdf"].includes(String(input.kind)))
          throw new ApiError(422, "invalid_kind");
        const content =
          input.content === undefined ? {} : object(input.content);
        const p: Post = {
          id: id(),
          site_id: MOCK_SITE_ID,
          author_id: actor.user_id,
          kind: input.kind as Post["kind"],
          status: "draft",
          draft_content: structuredClone(content),
          schema_version: 1,
          lock_version: 0,
          updated_at: now(),
          first_published_at: null,
          deleted_at: null,
        };
        state.posts.push(p);
        return p;
      }
      if (scopedPost) {
        const p = state.posts.find((p) => p.id === input.id);
        if (!p) throw new ApiError(404, "not_found");
        if (action === "admin.post.get") return p;
        if (action === "admin.post.published") {
          const published = publication(p.id);
          if (!published) return null;
          const revision = state.revisions.find(
            (candidate) => candidate.id === published.revision_id,
          );
          if (!revision) throw new ApiError(500, "internal_error");
          return {
            revision_id: published.revision_id,
            snapshot: structuredClone(revision.snapshot),
            published_at: published.published_at,
            updated_at: published.updated_at,
          };
        }
        if (action === "admin.revisions")
          return paginate(
            state.revisions
              .filter((r) => r.post_id === p.id)
              .slice()
              .reverse(),
            input,
          ).map(revisionSummary);
        if (action === "admin.revision.get") {
          const revision = state.revisions.find(
            (candidate) =>
              candidate.id === input.revision_id && candidate.post_id === p.id,
          );
          if (!revision) throw new ApiError(404, "not_found");
          return {
            ...revisionSummary(revision),
            snapshot: structuredClone(revision.snapshot),
          };
        }
        requireVersion(p.lock_version, input.version);
        if (action === "admin.post.save") {
          p.draft_content = structuredClone(object(input.content));
          p.lock_version++;
          p.updated_at = now();
          const latest = state.revisions
            .filter((revision) => revision.post_id === p.id)
            .at(-1);
          if (
            input.checkpoint === true &&
            (!latest || !sameContent(latest.snapshot, p.draft_content))
          )
            state.revisions.push({
              id: id(),
              post_id: p.id,
              snapshot: structuredClone(p.draft_content),
              created_at: now(),
              created_by: actor.user_id,
              schema_version: 1,
              reason: "checkpoint",
              post_version: p.lock_version,
            });
          return p;
        }
        if (action === "admin.revision.restore") {
          const r = state.revisions.find(
            (r) => r.id === input.revision_id && r.post_id === p.id,
          );
          if (!r) throw new ApiError(404, "not_found");
          const latest = state.revisions
            .filter((revision) => revision.post_id === p.id)
            .at(-1);
          if (
            !sameContent(p.draft_content, r.snapshot) &&
            (!latest || !sameContent(latest.snapshot, p.draft_content))
          )
            state.revisions.push({
              id: id(),
              post_id: p.id,
              snapshot: structuredClone(p.draft_content),
              created_at: now(),
              created_by: actor.user_id,
              schema_version: 1,
              reason: "before_restore",
              post_version: p.lock_version,
            });
          p.draft_content = structuredClone(r.snapshot);
          p.lock_version++;
          p.updated_at = now();
          return p;
        }
        if (action === "admin.revision.delete") {
          const index = state.revisions.findIndex(
            (revision) =>
              revision.id === input.revision_id && revision.post_id === p.id,
          );
          if (index < 0) throw new ApiError(404, "not_found");
          if (
            state.publications.some(
              (published) =>
                published.post_id === p.id &&
                published.revision_id === input.revision_id,
            )
          )
            throw new ApiError(409, "published_revision_protected");
          state.revisions.splice(index, 1);
          audit(actor, "post.revision.delete", p.id);
          return { deleted: true };
        }
        if (action === "admin.post.status") {
          if (input.status !== "private" && input.status !== "trashed")
            throw new ApiError(422, "invalid_status");
          p.status = input.status;
          p.lock_version++;
          p.updated_at = now();
          p.deleted_at = input.status === "trashed" ? now() : null;
          audit(actor, action, p.id);
          return { version: p.lock_version, status: p.status };
        }
        if (action === "admin.post.publish") {
          const rendered = validatePublication(p);
          const d = p.draft_content;
          const current = state.publications.find(
            (published) => published.post_id === p.id,
          );
          const currentRevision = state.revisions.find(
            (candidate) => candidate.id === current?.revision_id,
          );
          const latest = state.revisions
            .filter((candidate) => candidate.post_id === p.id)
            .at(-1);
          let revision: string;
          if (currentRevision && sameContent(currentRevision.snapshot, d)) {
            revision = currentRevision.id;
          } else if (
            latest &&
            latest.reason === "checkpoint" &&
            sameContent(latest.snapshot, d)
          ) {
            revision = latest.id;
            latest.reason = "published";
            latest.post_version = p.lock_version + 1;
          } else {
            revision = id();
            state.revisions.push({
              id: revision,
              post_id: p.id,
              snapshot: structuredClone(d),
              created_at: now(),
              created_by: actor.user_id,
              schema_version: 1,
              reason: "published",
              post_version: p.lock_version + 1,
            });
          }
          p.first_published_at ??= now();
          p.status = "published";
          p.deleted_at = null;
          p.lock_version++;
          p.updated_at = now();
          const published = {
            post_id: p.id,
            revision_id: revision,
            site_id: p.site_id,
            title: d.title!,
            slug: d.slug!,
            category_code: d.category_code!,
            tags: [...new Set(d.tags ?? [])],
            metadata: structuredClone(d.metadata ?? {}),
            body_html: rendered.html,
            cover_asset_id: p.kind === "article" ? d.cover_asset_id! : null,
            pdf_asset_id: p.kind === "pdf" ? d.pdf_asset_id! : null,
            comments_enabled:
              p.kind === "article" && d.comments_enabled !== false,
            published_at: p.first_published_at,
            updated_at: now(),
          };
          state.publications = state.publications.filter(
            (u) => u.post_id !== p.id,
          );
          state.publications.push(published);
          audit(actor, action, p.id);
          return {
            post_id: p.id,
            revision_id: revision,
            version: p.lock_version,
          };
        }
      }
      if (action.startsWith("admin.settings.")) {
        if (action === "admin.settings.get")
          return {
            draft: state.draftSettings,
            published: state.publishedSettings,
            version: state.settingsVersion,
          };
        requireVersion(state.settingsVersion, input.version);
        const settings = validateSettings(
          action === "admin.settings.save"
            ? input.settings
            : state.draftSettings,
        );
        state.draftSettings = settings;
        if (action === "admin.settings.apply")
          state.publishedSettings = structuredClone(settings);
        state.settingsVersion++;
        audit(actor, action, MOCK_SITE_ID);
        return { version: state.settingsVersion };
      }
      if (action === "admin.comments") {
        const filter = input.filter ?? "all";
        if (
          !["all", "unanswered", "reported", "hidden"].includes(String(filter))
        )
          throw new ApiError(422, "invalid_filter");
        const isStaff = (comment: Comment) =>
          state.members.some(
            (member) =>
              member.active &&
              member.role !== "reader" &&
              member.user_id === comment.author_id,
          );
        const openReports = (comment: Comment) =>
          state.reports
            .filter(
              (report) =>
                report.comment_id === comment.id && report.status === "open",
            )
            .sort(
              (a, b) =>
                b.created_at.localeCompare(a.created_at) ||
                b.id.localeCompare(a.id),
            )
            .map(({ id, reason, created_at }) => ({ id, reason, created_at }));
        return paginate(
          state.comments
            .filter((comment) => {
              if (filter === "hidden") return comment.status === "hidden";
              if (filter === "reported") return openReports(comment).length > 0;
              if (filter === "unanswered")
                return (
                  comment.parent_id === null &&
                  comment.status === "visible" &&
                  !state.comments.some(
                    (reply) =>
                      reply.post_id === comment.post_id &&
                      reply.parent_id === comment.id &&
                      reply.status === "visible" &&
                      isStaff(reply),
                  )
                );
              return true;
            })
            .sort(
              (a, b) =>
                b.created_at.localeCompare(a.created_at) ||
                b.id.localeCompare(a.id),
            ),
          input,
        ).map((comment) => ({
          id: comment.id,
          post_id: comment.post_id,
          parent_id: comment.parent_id,
          body: comment.body,
          status: comment.status,
          version: comment.version,
          created_at: comment.created_at,
          author_kind: comment.author_kind,
          display_name: publicComment(comment).display_name,
          post_title:
            state.publications.find((p) => p.post_id === comment.post_id)
              ?.title ??
            state.posts.find((p) => p.id === comment.post_id)?.draft_content
              .title ??
            "제목 없는 글",
          is_staff: isStaff(comment),
          comments_enabled:
            publication(comment.post_id)?.comments_enabled ?? false,
          open_reports: openReports(comment),
        }));
      }
      if (action === "admin.account.deletions") {
        if (!(["owner", "admin"] as Role[]).includes(actor.role))
          throw new ApiError(403, "forbidden");
        return paginate(
          state.accountDeletions.filter((item) => item.status !== "completed"),
          input,
        );
      }
      if (action === "admin.account.deletion.anonymize") {
        if (!(["owner", "admin"] as Role[]).includes(actor.role))
          throw new ApiError(403, "forbidden");
        const request = state.accountDeletions.find(
          (item) => item.id === input.id && item.status === "pending",
        );
        if (!request?.user_id) throw new ApiError(404, "not_found");
        const comments = state.comments.filter(
          (item) => item.author_id === request.user_id,
        );
        for (const comment of comments) {
          comment.author_id = null;
          comment.author_kind = "anonymized";
          comment.guest_name = null;
          delete comment.password;
          comment.version++;
        }
        request.status = "anonymized";
        request.anonymized_at = now();
        return { status: "anonymized", comments_anonymized: comments.length };
      }
      if (action === "admin.account.deletion.complete") {
        if (!(["owner", "admin"] as Role[]).includes(actor.role))
          throw new ApiError(403, "forbidden");
        const request = state.accountDeletions.find(
          (item) =>
            item.id === input.id &&
            item.status === "anonymized" &&
            item.user_id === null,
        );
        if (!request) throw new ApiError(409, "account_deletion_not_ready");
        request.status = "completed";
        request.completed_at = now();
        return { status: "completed" };
      }
      if (action === "admin.comment.moderate") {
        const c = state.comments.find((c) => c.id === input.id);
        if (!c) throw new ApiError(404, "not_found");
        requireVersion(c.version, input.version);
        if (
          c.status === "deleted" ||
          !["visible", "hidden", "deleted"].includes(String(input.status))
        )
          throw new ApiError(422, "invalid_status");
        c.status = input.status as Comment["status"];
        if (c.status === "deleted") c.body = "";
        c.version++;
        c.updated_at = now();
        audit(actor, action, c.id);
        return { version: c.version };
      }
      if (action === "admin.reports") return paginate(state.reports, input);
      if (action === "admin.report.resolve") {
        const report = state.reports.find((r) => r.id === input.id);
        if (!report) throw new ApiError(404, "not_found");
        if (!["resolved", "dismissed"].includes(String(input.status)))
          throw new ApiError(422, "invalid_status");
        report.status = String(input.status);
        return { saved: true };
      }
      if (action === "admin.audit") {
        staff(actor, ["admin", "owner"]);
        return paginate(state.audit, input);
      }
      if (action === "admin.members") {
        staff(actor, ["owner"]);
        return state.members
          .filter((m) => m.role !== "reader")
          .map(({ display_name, ...membership }) => {
            void display_name;
            return {
              ...membership,
              granted_by: null,
              created_at: MOCK_NOW,
              updated_at: now(),
            };
          });
      }
      if (action === "admin.member.set") {
        staff(actor, ["owner"]);
        const target = state.members.find((m) => m.user_id === input.user_id);
        if (!target) throw new ApiError(404, "not_found");
        if (
          !["editor", "admin", "owner"].includes(String(input.role)) ||
          (input.active !== undefined && typeof input.active !== "boolean")
        )
          throw new ApiError(422, "invalid_role");
        if (
          target.active &&
          target.role === "owner" &&
          (input.role !== "owner" || input.active === false) &&
          state.members.filter((m) => m.active && m.role === "owner").length ===
            1
        )
          throw new ApiError(409, "last_owner");
        target.role = input.role as Role;
        target.active = input.active !== false;
        audit(actor, action, target.user_id);
        return { saved: true };
      }
    }
    throw new ApiError(400, "unknown_action");
  }
  return {
    reset(next: Scenario = "default") {
      scenario = next;
      state = createFixtures(next === "empty");
      visitors.clear();
      failures.clear();
      sequence = 100;
    },
    failNext(action: string, status = 500, code = "mock_failure") {
      failures.set(action, { status, code });
    },
    snapshot: () => structuredClone(state),
    handle(body: unknown, rawHeaders: Record<string, string> = {}): MockResult {
      const requestId = id();
      try {
        const envelope = object(body);
        const action = validateAction(envelope.action);
        const input = cleanInput(envelope.input ?? {});
        const failure = failures.get(action);
        if (failure) {
          failures.delete(action);
          throw new ApiError(failure.status, failure.code);
        }
        if (scenario === "error") throw new ApiError(500, "mock_unavailable");
        if (scenario === "rate-limited")
          throw new ApiError(429, "rate_limited", 60);
        const headers = Object.fromEntries(
          Object.entries(rawHeaders).map(([key, value]) => [
            key.toLowerCase(),
            value,
          ]),
        );
        const person = member(headers);
        if (memberActions.has(action) && !person)
          throw new ApiError(401, "login_required");
        if (
          scenario === "conflict" &&
          ["comment.create", "admin.post.save", "admin.settings.save"].includes(
            action,
          )
        )
          throw new ApiError(409, "version_conflict");
        return {
          status: 200,
          body: parseActionOutput(
            action as ApiAction,
            structuredClone(dispatch(action, input, headers)),
          ),
        };
      } catch (error) {
        if (error instanceof ApiError)
          return {
            status: error.status,
            body: { error: error.message, request_id: requestId },
            headers: error.retryAfter
              ? { "Retry-After": String(error.retryAfter) }
              : undefined,
          };
        // Unexpected programming errors must fail tests rather than masquerade as successful mocks.
        throw error;
      }
    },
  };
}
export type MockEngine = ReturnType<typeof createMockEngine>;
