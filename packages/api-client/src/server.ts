import "server-only";
import { createServerReader } from "./server-transport";
export function createServerTravelApi(
  options: {
    getAccessToken?: () => Promise<string | undefined>;
    baseURL?: string;
  } = {},
) {
  const mocking = process.env.NEXT_PUBLIC_API_MOCKING === "enabled";
  // Explicit isolated HTTP backend only; browser Mirage cannot serve SSR.
  const baseURL =
    options.baseURL ??
    (mocking
      ? process.env.TRAVEL_SSR_API_URL
      : process.env.NEXT_PUBLIC_SUPABASE_URL
        ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/travel-api`
        : undefined);
  if (!baseURL)
    throw new Error(
      "Server travel-api endpoint is not configured; Mirage is browser-only.",
    );
  return createServerReader({ ...options, baseURL });
}
