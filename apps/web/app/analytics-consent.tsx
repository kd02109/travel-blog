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
        if (!active) return;
        setError(false);
        if (enabled && consent) trackPage(path);
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
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-4">
        <p>방문 통계 수집에 동의하면 블로그 개선에 도움이 됩니다.</p>
        <Button variant="outline" onClick={() => setConsent(!consent)}>
          {consent ? "통계 수집 끄기" : "통계 수집 동의"}
        </Button>
      </div>
      {error && (
        <div
          role="alert"
          className="border-border bg-surface grid min-h-36 place-items-center border px-6 py-5 text-center"
        >
          <div>
            <strong className="text-sm">통계 서비스를 연결하지 못했어요</strong>
            <p className="text-muted-foreground mt-2 text-xs leading-relaxed">
              여행 기록은 계속 읽을 수 있습니다. 잠시 뒤 다시 확인해 주세요.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
