import { z } from "zod";
export * from "./actions";
export const apiErrorSchema = z.object({
  error: z.string(),
  request_id: z.string().optional(),
});
