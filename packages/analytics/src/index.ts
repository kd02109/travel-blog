"use client";
import { getApps, initializeApp, type FirebaseOptions } from "firebase/app";
import {
  initializeAnalytics,
  isSupported,
  logEvent,
  setAnalyticsCollectionEnabled,
  setConsent,
  type Analytics,
} from "firebase/analytics";
let analytics: Analytics | undefined;
let consent = false;
let pending: Promise<void> | undefined;
export async function setAnalyticsConsent(
  granted: boolean,
  config: FirebaseOptions,
) {
  consent = granted;
  if (analytics) {
    setAnalyticsCollectionEnabled(analytics, granted);
    setConsent({
      analytics_storage: granted ? "granted" : "denied",
      ad_storage: "denied",
      ad_user_data: "denied",
      ad_personalization: "denied",
    });
    return;
  }
  if (
    !granted ||
    typeof window === "undefined" ||
    !config.apiKey ||
    !config.appId ||
    !config.measurementId
  )
    return;
  pending ??= (async () => {
    if (!(await isSupported()) || !consent) return;
    setConsent({
      analytics_storage: "granted",
      ad_storage: "denied",
      ad_user_data: "denied",
      ad_personalization: "denied",
    });
    const app =
      getApps().find((app) => app.name === "travel-analytics") ??
      initializeApp(config, "travel-analytics");
    analytics = initializeAnalytics(app, {
      config: {
        send_page_view: false,
        allow_google_signals: false,
        allow_ad_personalization_signals: false,
      },
    });
    setAnalyticsCollectionEnabled(analytics, consent);
  })().finally(() => {
    pending = undefined;
  });
  await pending;
}
export function trackPage(path: string) {
  if (analytics && consent)
    logEvent(analytics, "page_view", {
      page_location: `${window.location.origin}${path.split(/[?#]/)[0]}`,
      page_title: "오늘도 함께 걷다",
    });
}
