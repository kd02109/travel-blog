import { safeReturnPath } from "@repo/database/auth-flow";
import { redirect } from "next/navigation";

/** Keep old login links and OAuth error redirects working without a login page. */
export default async function Login({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; status?: string; next?: string }>;
}) {
  const params = await searchParams;
  if (params.status === "signed_out" && !params.error) redirect("/");
  const next = safeReturnPath(params.next);
  const destination = new URL(next, "http://travel.local");
  const authConfigured = Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  );
  // Keep login feedback visible even when the API is not configured.
  const target = !authConfigured
    ? new URL("/notice", "http://travel.local")
    : destination.pathname === "/account"
      ? new URL("/", "http://travel.local")
      : destination;
  target.searchParams.set("login", "1");
  if (next !== "/") target.searchParams.set("next", next);
  if (params.error) target.searchParams.set("error", params.error);
  if (params.status) target.searchParams.set("status", params.status);
  redirect(`${target.pathname}${target.search}${target.hash}`);
}
