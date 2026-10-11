import { describe, expect, it } from "vitest";
import { authUsersDashboardUrl } from "./auth-dashboard";

describe("Supabase Auth dashboard link", () => {
  it("uses the project ref from the configured Supabase URL", () => {
    expect(authUsersDashboardUrl("https://sample-project.supabase.co")).toBe(
      "https://supabase.com/dashboard/project/sample-project/auth/users",
    );
  });

  it("falls back to the project list when there is no SaaS project ref", () => {
    expect(authUsersDashboardUrl(undefined)).toBe(
      "https://supabase.com/dashboard/projects",
    );
    expect(authUsersDashboardUrl("http://localhost:54321")).toBe(
      "https://supabase.com/dashboard/projects",
    );
  });
});
