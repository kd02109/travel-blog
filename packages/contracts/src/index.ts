import { z } from "zod";
import { CATEGORY_CODES } from "@repo/constants";
export const categorySchema = z.enum(CATEGORY_CODES);
export const postListInputSchema = z.object({
  site_id: z.uuid(),
  category: categorySchema.optional(),
  limit: z.number().int().min(1).max(50).default(12),
  offset: z.number().int().nonnegative().default(0),
});
export const apiErrorSchema = z.object({
  error: z.string(),
  request_id: z.string().optional(),
});
export const siteSchema = z
  .object({ id: z.uuid(), name: z.string() })
  .passthrough();
export type PostListInput = z.input<typeof postListInputSchema>;

export const membershipSchema = z.object({
  memberships: z.array(z.object({ site_id: z.uuid(), role: z.string() })),
});
