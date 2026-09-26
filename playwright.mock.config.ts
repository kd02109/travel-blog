import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./e2e",
  testMatch: "mock.spec.ts",
  fullyParallel: true,
  retries: process.env.CI ? 2 : 0,
  use: { baseURL: "http://localhost:3010", trace: "retain-on-failure" },
  webServer: [
    {
      command: "pnpm --filter web exec next dev --port 3010",
      url: "http://localhost:3010",
      reuseExistingServer: false,
      env: {
        NEXT_PUBLIC_API_MOCKING: "enabled",
        TRAVEL_NEXT_DIST_DIR: ".next-test-mock",
        NEXT_PUBLIC_SENTRY_DSN: "",
        NEXT_PUBLIC_ANALYTICS_ENABLED: "false",
        NEXT_PUBLIC_SUPABASE_URL: "https://mock-test.supabase.co",
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "mock-not-a-real-key",
      },
    },
    {
      command: "pnpm --filter admin exec next dev --port 3012",
      url: "http://localhost:3012",
      reuseExistingServer: false,
      env: {
        NEXT_PUBLIC_API_MOCKING: "enabled",
        TRAVEL_NEXT_DIST_DIR: ".next-test-mock",
        NEXT_PUBLIC_SENTRY_DSN: "",
        NEXT_PUBLIC_ANALYTICS_ENABLED: "false",
        NEXT_PUBLIC_SUPABASE_URL: "https://mock-test.supabase.co",
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "mock-not-a-real-key",
      },
    },
  ],
});
