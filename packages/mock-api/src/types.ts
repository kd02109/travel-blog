import type { CategoryCode } from "@repo/constants";
export type Role = "reader" | "editor" | "admin" | "owner";
export type Scenario =
  "default" | "empty" | "error" | "rate-limited" | "slow" | "conflict";
export type Content = {
  title?: string;
  slug?: string;
  category_code?: CategoryCode;
  tags?: string[];
  blocks?: unknown[];
  metadata?: Record<string, string | number>;
  cover_asset_id?: string;
  pdf_asset_id?: string;
  comments_enabled?: boolean;
};
export type Post = {
  id: string;
  site_id: string;
  author_id: string;
  kind: "article" | "pdf";
  status: "draft" | "published" | "private" | "trashed";
  draft_content: Content;
  schema_version: number;
  lock_version: number;
  updated_at: string;
  first_published_at: string | null;
  deleted_at: string | null;
};
export type Publication = {
  post_id: string;
  site_id: string;
  title: string;
  slug: string;
  category_code: CategoryCode;
  tags: string[];
  metadata: Record<string, string | number>;
  body_html: string | null;
  cover_asset_id: string | null;
  pdf_asset_id: string | null;
  comments_enabled: boolean;
  published_at: string;
  updated_at: string;
};
export type Settings = {
  template_id?: "A" | "B" | "C" | "D";
  title?: string;
  description?: string;
  hero_asset_id?: string;
  hero_asset_ids?: string[];
  featured_post_id?: string;
};
export type Comment = {
  id: string;
  post_id: string;
  parent_id: string | null;
  body: string;
  status: "visible" | "hidden" | "deleted";
  version: number;
  created_at: string;
  updated_at: string;
  author_id: string | null;
  author_kind: "member" | "guest" | "anonymized";
  guest_name: string | null;
  // Mock-only credentials and idempotency data must never appear in API responses.
  password?: string;
  actor: string;
  request_key: string;
  fingerprint: string;
};
export type Asset = {
  id: string;
  kind: "image" | "pdf";
  state: "ready" | "processing" | "uploading" | "failed";
  metadata: Record<string, string | number>;
  preview_asset_id: string | null;
  url: string;
};
export type Member = {
  user_id: string;
  site_id: string;
  role: Role;
  active: boolean;
  display_name: string;
};
export type Revision = {
  id: string;
  post_id: string;
  snapshot: Content;
  created_at: string;
  created_by: string;
  schema_version: number;
};
export type MockState = {
  posts: Post[];
  publications: Publication[];
  comments: Comment[];
  assets: Asset[];
  members: Member[];
  revisions: Revision[];
  likes: Record<string, string[]>;
  draftSettings: Settings;
  publishedSettings: Settings;
  settingsVersion: number;
  reports: {
    id: string;
    comment_id: string;
    reporter_id: string;
    reason: string;
    status: string;
    created_at: string;
  }[];
  accountDeletions: {
    id: string;
    user_id: string | null;
    email: string | null;
    status: "pending" | "anonymized" | "completed";
    requested_at: string;
    anonymized_at: string | null;
    completed_at: string | null;
  }[];
  audit: {
    changes: Record<string, unknown>;
    id: string;
    site_id: string;
    actor_id: string;
    action: string;
    resource_id: string;
    created_at: string;
  }[];
};
export type MockResult = {
  status: number;
  body: unknown;
  headers?: Record<string, string>;
};
export type MockOptions = {
  scenario?: Scenario;
  now?: () => string;
  origin?: string;
};
