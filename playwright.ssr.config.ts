import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./e2e",
  testMatch: "ssr.spec.ts",
  fullyParallel: false,
  use: {
    baseURL: "http://localhost:3040",
    javaScriptEnabled: false,
    trace: "retain-on-failure",
  },
  webServer: [
    {
      command: "node tests/ssr/backend.mjs",
      url: "http://127.0.0.1:3049/health",
      reuseExistingServer: false,
    },
    {
      command: "pnpm --filter web exec next dev --port 3040",
      url: "http://localhost:3040",
      reuseExistingServer: false,
      env: {
        TRAVEL_NEXT_DIST_DIR: ".next-test-ssr",
        NEXT_PUBLIC_API_MOCKING: "disabled",
        NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:3049",
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "test-only-placeholder",
        NEXT_PUBLIC_SENTRY_DSN: "",
        NEXT_PUBLIC_ANALYTICS_ENABLED: "false",
      },
    },
  ],
});
