import { describe, expect, it } from "vitest";
import { authUsersDashboardUrl } from "./auth-dashboard";

describe("Supabase Auth dashboard link", () => {
  it("uses the configured staging project rather than a production ref", () => {
    expect(
      authUsersDashboardUrl("https://bnfihijsquvvkneoutie.supabase.co"),
    ).toBe(
      "https://supabase.com/dashboard/project/bnfihijsquvvkneoutie/auth/users",
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
