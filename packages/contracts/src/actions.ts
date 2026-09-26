import { z } from "zod";
import { CATEGORY_CODES } from "@repo/constants";
const uuid = z.uuid();
const version = z.number().int().nonnegative();
const json = z.record(z.string(), z.json());
// SQL returns timestamptz strings with offsets, not only UTC Z timestamps.
const timestamp = z.iso.datetime({ offset: true });
const role = z.enum(["owner", "admin", "editor"]);
const kind = z.enum(["article", "pdf"]);
const status = z.enum(["draft", "published", "private", "trashed"]);
const commentStatus = z.enum(["visible", "hidden", "deleted"]);
const reason = z.enum(["spam", "abuse", "personal_information", "other"]);
const page = {
  limit: z.number().int().min(1).max(50).default(12),
  offset: z.number().int().min(0).max(100000).default(0),
};
const scoped = { site_id: uuid };
const resource = { id: uuid, site_id: uuid.optional() };
const versioned = { ...resource, version };
const password = z.string().min(8).max(128).optional();
const body = z.string().trim().min(1).max(1000);
const saved = z.object({ saved: z.literal(true) });
const changed = z.object({ version });
const settings = json;
// Draft content and category metadata are versioned JSON documents. Publication
// validation remains authoritative on the server, allowing incomplete drafts.
const content = json;
export const categorySchema = z.enum(CATEGORY_CODES);
export const siteSchema = z.object({
  id: uuid,
  slug: z.string(),
  name: z.string(),
  settings,
  version,
});
export const postListInputSchema = z.strictObject({
  ...scoped,
  ...page,
  category: categorySchema.optional(),
  tag: z.string().optional(),
});
export type PostListInput = z.input<typeof postListInputSchema>;
const card = z.object({
  post_id: uuid,
  slug: z.string(),
  title: z.string(),
  category_code: categorySchema,
  tags: z.array(z.string()),
  metadata: json,
  cover_asset_id: uuid.nullable(),
  pdf_asset_id: uuid.nullable(),
  published_at: timestamp,
  updated_at: timestamp,
  like_count: version.nullable(),
  comment_count: version.nullable(),
});
const publication = card.extend({
  site_id: uuid,
  body_html: z.string().nullable(),
  comments_enabled: z.boolean(),
});
const draft = z.object({
  id: uuid,
  site_id: uuid,
  author_id: uuid,
  kind,
  status,
  draft_content: content,
  schema_version: version,
  lock_version: version,
  first_published_at: timestamp.nullable(),
  deleted_at: timestamp.nullable(),
  updated_at: timestamp,
});
const adminCard = z.object({
  id: uuid,
  kind,
  status,
  category_code: categorySchema.nullable(),
  title: z.string().nullable(),
  lock_version: version,
  updated_at: timestamp,
  first_published_at: timestamp.nullable(),
});
const profile = z.object({
  user_id: uuid,
  display_name: z.string(),
  avatar_asset_id: uuid.nullable(),
});
export const membershipSchema = z.object({
  memberships: z.array(z.object({ site_id: uuid, role, name: z.string() })),
});
const me = membershipSchema.extend({
  user_id: uuid,
  profile: profile.nullable(),
});
const comment = z.object({
  id: uuid,
  parent_id: uuid.nullable(),
  body: z.string(),
  status: commentStatus,
  version,
  created_at: timestamp,
  updated_at: timestamp,
  display_name: z.string(),
  is_staff: z.boolean(),
});
const member = z.object({
  site_id: uuid,
  user_id: uuid,
  role,
  active: z.boolean(),
  granted_by: uuid.nullable(),
  created_at: timestamp,
  updated_at: timestamp,
});
const report = z.object({
  id: uuid,
  comment_id: uuid,
  reporter_id: uuid,
  reason,
  status: z.enum(["open", "resolved", "dismissed"]),
  created_at: timestamp,
});
const audit = z.object({
  id: uuid,
  site_id: uuid,
  actor_id: uuid.nullable(),
  action: z.string(),
  resource_id: uuid.nullable(),
  changes: json,
  created_at: timestamp,
});
function contract<I extends z.ZodType, O extends z.ZodType>(
  input: I,
  output: O,
) {
  return { input, output };
}
const empty = z.strictObject({});
export const actionContracts = {
  "site.get": contract(
    z.strictObject({ site_id: uuid.optional(), slug: z.string().optional() }),
    siteSchema,
  ),
  "posts.list": contract(postListInputSchema, z.array(card)),
  "post.get": contract(
    z
      .strictObject({
        ...scoped,
        id: uuid.optional(),
        slug: z.string().optional(),
      })
      .refine((v) => Boolean(v.id || v.slug), "id or slug required"),
    publication,
  ),
  "comments.list": contract(
    z.strictObject({ id: uuid, ...page }),
    z.array(comment),
  ),
  "like.get": contract(
    z.strictObject({ id: uuid }),
    z.object({ liked: z.boolean(), count: version }),
  ),
  "visitor.create": contract(
    empty,
    z.object({
      visitor_token: z.string().min(1),
      expires_at: z.number().int().positive(),
    }),
  ),
  me: contract(empty, me),
  "profile.save": contract(
    z.strictObject({ display_name: z.string().trim().min(2).max(30) }),
    saved,
  ),
  "comment.create": contract(
    z.strictObject({
      id: uuid,
      body,
      request_key: uuid,
      parent_id: uuid.nullable().optional(),
      guest_name: z.string().trim().min(2).max(30).optional(),
      password,
    }),
    z.object({ id: uuid, version, duplicate: z.boolean() }),
  ),
  "comment.edit": contract(
    z.strictObject({ id: uuid, version, body, password }),
    z.object({ id: uuid, version }),
  ),
  "comment.delete": contract(
    z.strictObject({ id: uuid, version, password }),
    z.object({ id: uuid, version }),
  ),
  "comment.report": contract(
    z.strictObject({ id: uuid, reason }),
    z.object({ reported: z.literal(true) }),
  ),
  "like.set": contract(
    z.strictObject({ id: uuid, liked: z.boolean() }),
    z.object({ liked: z.boolean(), count: version }),
  ),
  "admin.posts": contract(
    z.strictObject({
      ...scoped,
      ...page,
      category: categorySchema.optional(),
      status: status.optional(),
      search: z.string().trim().max(100).optional(),
    }),
    z.array(adminCard),
  ),
  "admin.post.get": contract(z.strictObject(resource), draft),
  "admin.post.create": contract(
    z.strictObject({ ...scoped, kind, content: content.default({}) }),
    draft,
  ),
  "admin.post.save": contract(
    z.strictObject({
      ...versioned,
      content,
      checkpoint: z.boolean().optional(),
    }),
    draft,
  ),
  "admin.post.publish": contract(
    z.strictObject(versioned),
    z.object({ post_id: uuid, revision_id: uuid, version }),
  ),
  "admin.post.status": contract(
    z.strictObject({ ...versioned, status: z.enum(["private", "trashed"]) }),
    changed.extend({ status: z.enum(["private", "trashed"]) }),
  ),
  "admin.revisions": contract(
    z.strictObject({ ...resource, ...page }),
    z.array(
      z.object({
        id: uuid,
        created_at: timestamp,
        created_by: uuid,
        schema_version: version,
      }),
    ),
  ),
  "admin.revision.restore": contract(
    z.strictObject({ ...versioned, revision_id: uuid }),
    draft,
  ),
  "admin.members": contract(z.strictObject(scoped), z.array(member)),
  "admin.member.set": contract(
    z.strictObject({
      ...scoped,
      user_id: uuid,
      role,
      active: z.boolean().default(true),
    }),
    saved,
  ),
  "admin.settings.get": contract(
    z.strictObject(scoped),
    z.object({ draft: settings, published: settings, version }),
  ),
  "admin.settings.save": contract(
    z.strictObject({ ...scoped, version, settings }),
    changed,
  ),
  "admin.settings.apply": contract(
    z.strictObject({ ...scoped, version }),
    changed,
  ),
  "admin.comments": contract(
    z.strictObject({ ...scoped, ...page }),
    z.array(
      z.object({
        id: uuid,
        post_id: uuid,
        parent_id: uuid.nullable(),
        body: z.string(),
        status: commentStatus,
        version,
        created_at: timestamp,
        author_kind: z.enum(["member", "guest", "anonymized"]),
        display_name: z.string(),
      }),
    ),
  ),
  "admin.comment.moderate": contract(
    z.strictObject({ ...scoped, id: uuid, version, status: commentStatus }),
    changed,
  ),
  "admin.reports": contract(
    z.strictObject({ ...scoped, ...page }),
    z.array(report),
  ),
  "admin.report.resolve": contract(
    z.strictObject({
      ...scoped,
      id: uuid,
      status: z.enum(["resolved", "dismissed"]),
    }),
    saved,
  ),
  "admin.audit": contract(
    z.strictObject({ ...scoped, ...page }),
    z.array(audit),
  ),
  "asset.create": contract(
    z.strictObject({ ...scoped, kind: z.enum(["image", "pdf"]) }),
    z.object({
      id: uuid,
      bucket: z.string(),
      upload_url: z.url(),
      token: z.string(),
      path: z.string(),
    }),
  ),
  "asset.complete": contract(
    z.strictObject(resource),
    z.object({
      id: uuid,
      state: z.enum(["uploading", "processing", "ready", "failed"]),
    }),
  ),
  "asset.cancel": contract(z.strictObject(resource), saved),
  "asset.access": contract(
    z.strictObject(resource),
    z.object({
      id: uuid,
      url: z.url(),
      expires_in: z.number().int().positive(),
      metadata: json,
      preview_asset_id: uuid.nullable(),
    }),
  ),
} as const;
export type ApiAction = keyof typeof actionContracts;
export type ActionInput<A extends ApiAction> = z.input<
  (typeof actionContracts)[A]["input"]
>;
export type ActionOutput<A extends ApiAction> = z.output<
  (typeof actionContracts)[A]["output"]
>;
export function parseActionInput<A extends ApiAction>(
  action: A,
  input: ActionInput<A>,
) {
  return actionContracts[action].input.parse(input);
}
export function parseActionOutput<A extends ApiAction>(
  action: A,
  output: unknown,
): ActionOutput<A> {
  return actionContracts[action].output.parse(output) as ActionOutput<A>;
}
