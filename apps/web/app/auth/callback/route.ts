import { createServerDatabase } from "@repo/database/server";
import { handleRememberedCallback } from "@repo/database/auth-flow";
export function GET(request: Request) {
  return handleRememberedCallback(request, createServerDatabase);
}
