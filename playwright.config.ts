import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./e2e",
  testIgnore: "mock.spec.ts",
  fullyParallel: true,
  retries: process.env.CI ? 2 : 0,
  use: { baseURL: "http://localhost:3000", trace: "retain-on-failure" },
  webServer: [
    {
      command: "pnpm --filter web exec next dev --port 3000",
      url: "http://localhost:3000",
      reuseExistingServer: false,
      env: {
        NEXT_PUBLIC_API_MOCKING: "disabled",
        NEXT_PUBLIC_SUPABASE_URL: "",
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "",
        NEXT_PUBLIC_SENTRY_DSN: "",
        NEXT_PUBLIC_ANALYTICS_ENABLED: "false",
      },
    },
    {
      command: "pnpm --filter admin exec next dev --port 3002",
      url: "http://localhost:3002",
      reuseExistingServer: false,
      env: {
        NEXT_PUBLIC_API_MOCKING: "disabled",
        NEXT_PUBLIC_SUPABASE_URL: "",
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "",
        NEXT_PUBLIC_SENTRY_DSN: "",
        NEXT_PUBLIC_ANALYTICS_ENABLED: "false",
      },
    },
  ],
});
