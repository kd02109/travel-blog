import { createServerDatabase } from "@repo/database/server";
import { handleCallback } from "@repo/database/auth-flow";
export function GET(request: Request) {
  return handleCallback(request, createServerDatabase);
}
