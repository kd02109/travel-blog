"use client";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { setAnalyticsConsent, trackPage } from "@repo/analytics";
import { Button } from "@repo/ui/button";
const config = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
};
export function AnalyticsConsent() {
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState(false);
  const path = usePathname();
  const enabled =
    process.env.NEXT_PUBLIC_ANALYTICS_ENABLED === "true" &&
    process.env.NEXT_PUBLIC_API_MOCKING !== "enabled";
  useEffect(() => {
    let active = true;
    void setAnalyticsConsent(enabled && consent, config)
      .then(() => {
        if (active && enabled && consent) trackPage(path);
      })
      .catch(() => {
        if (active) setError(true);
      });
    return () => {
      active = false;
    };
  }, [consent, enabled, path]);
  if (!enabled) return null;
  return (
    <div className="flex flex-wrap items-center gap-4">
      <p>방문 통계 수집에 동의하면 블로그 개선에 도움이 됩니다.</p>
      <Button variant="outline" onClick={() => setConsent(!consent)}>
        {consent ? "통계 수집 끄기" : "통계 수집 동의"}
      </Button>
      {error && <p role="status">통계 서비스를 연결하지 못했습니다.</p>}
    </div>
  );
}
