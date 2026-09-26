import { createServerTravelApi } from "@repo/api-client/server";
import { AboutContent } from "./about-content";

export const dynamic = "force-dynamic";

export default async function About() {
  if (process.env.NEXT_PUBLIC_API_MOCKING === "enabled" && !process.env.TRAVEL_SSR_API_URL)
    return <AboutContent />;
  let initialSite;
  try {
    initialSite = await createServerTravelApi().getSite();
  } catch {
    // Fall back to the public browser query and its retry state.
  }
  return <AboutContent initialSite={initialSite} />;
}
