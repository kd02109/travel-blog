import { rememberOAuthReturn } from "@repo/database/auth-flow";

export function POST(request: Request) {
  return rememberOAuthReturn(request);
}
