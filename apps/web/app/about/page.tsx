import { createServerTravelApi } from "@repo/api-client/server";
import { AboutContent } from "./about-content";

export const dynamic = "force-dynamic";

export default async function About() {
  if (
    process.env.NEXT_PUBLIC_API_MOCKING === "enabled" &&
    !process.env.TRAVEL_SSR_API_URL
  )
    return <AboutContent />;
  let initialSite;
  let initialError: string | undefined;
  try {
    initialSite = await createServerTravelApi().getSite();
  } catch {
    initialError =
      "사이트 정보를 불러오지 못했습니다. 연결을 확인한 뒤 다시 시도해 주세요.";
  }
  return <AboutContent initialSite={initialSite} initialError={initialError} />;
}
