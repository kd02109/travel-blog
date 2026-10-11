import { expect, it } from "vitest";
import {
  parseErrorListQuery,
  errorListLocation,
  supabaseDiagnosticLinks,
} from "./error-analytics";
it("keeps filters in pagination URLs and accepts exact identifiers only", () => {
  const q = parseErrorListQuery({
    search: " A".trim() + "A".repeat(63),
    status: "resolved",
    page: "3",
  });
  expect(q).toMatchObject({
    valid: true,
    status: "resolved",
    page: 3,
    search: "a".repeat(64),
  });
  const location = errorListLocation({ ...q, page: 4 });
  expect(location).toContain("status=resolved&page=4");
  expect(location).toContain("search=" + "a".repeat(64));
  expect(parseErrorListQuery({ search: "' OR true--" }).valid).toBe(false);
  expect(parseErrorListQuery({ page: "-3" }).page).toBe(1);
  expect(parseErrorListQuery({ page: "999999999999999999" }).page).toBe(1);
});
it("links only recognized hosted Supabase projects without embedding keys", () => {
  expect(
    supabaseDiagnosticLinks("https://abcdefghijklmnopqrst.supabase.co"),
  ).toEqual({
    sql: "https://supabase.com/dashboard/project/abcdefghijklmnopqrst/sql/new",
    logs: "https://supabase.com/dashboard/project/abcdefghijklmnopqrst/logs/explorer",
  });
  expect(
    supabaseDiagnosticLinks("https://supabase.co.evil.invalid"),
  ).toBeNull();
  expect(supabaseDiagnosticLinks("http://localhost:54321")).toBeNull();
});

it("defaults dashboard to production/24h but makes exact-ID lookup searchable across environments", () => {
  expect(parseErrorListQuery({})).toMatchObject({
    environment: "production",
    period: "24h",
    app: "all",
  });
  expect(parseErrorListQuery({ search: "a".repeat(64) })).toMatchObject({
    environment: "all",
    period: "all",
  });
  const q = parseErrorListQuery({
    environment: "preview",
    period: "7d",
    app: "admin",
    status: "open",
  });
  const location = errorListLocation({ ...q, page: 2 });
  for (const expected of [
    "environment=preview",
    "period=7d",
    "app=admin",
    "status=open",
    "page=2",
  ])
    expect(location).toContain(expected);
});
