import type { ApiAction } from "@repo/contracts";
export const readActions = [
  "site.get",
  "posts.list",
  "post.get",
  "comments.list",
  "like.get",
  "asset.access",
  "me",
  "admin.posts",
  "admin.post.get",
  "admin.revisions",
  "admin.members",
  "admin.settings.get",
  "admin.comments",
  "admin.account.deletions",
  "admin.reports",
  "admin.audit",
] as const satisfies readonly ApiAction[];
export type ReadAction = (typeof readActions)[number];
export type MutationAction = Exclude<ApiAction, ReadAction>;
