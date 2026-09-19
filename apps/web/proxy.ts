import { NextResponse, type NextRequest } from "next/server";
import { refreshSession } from "@repo/database/proxy";
// Mirage cannot intercept server requests. Skip session refresh in offline mock mode;
// protected server routes still perform their real authorization checks.
export async function proxy(request: NextRequest) {
  if (
    process.env.NODE_ENV === "development" &&
    process.env.NEXT_PUBLIC_API_MOCKING === "enabled"
  )
    return NextResponse.next({ request });
  return refreshSession(request);
}
export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
