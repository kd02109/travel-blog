import { createServerDatabase } from "@repo/database/server";
import { handleSignOut } from "@repo/database/auth-flow";
export function POST(request: Request) {
  return handleSignOut(request, createServerDatabase);
}
