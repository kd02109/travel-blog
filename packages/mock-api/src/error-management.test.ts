import { expect, it } from "vitest";
import { actionContracts } from "@repo/contracts";
import {
  errorManagementInput,
  errorFingerprintParts,
} from "../../../supabase/functions/travel-api/core";
const site_id = "10000000-0000-4000-8000-000000000001";
it("matches gateway and client validation for error administration", () => {
  for (const input of [
    { site_id, offset: -1 },
    { site_id, search: "bad" },
    { site_id, limit: 51 },
    { site_id, search: null },
    { site_id, status: "deleted" },
    { site_id, actor: site_id },
  ]) {
    expect(() => errorManagementInput("admin.errors.page", input)).toThrow();
    expect(
      actionContracts["admin.errors.page"].input.safeParse(input).success,
    ).toBe(false);
  }
  expect(
    errorManagementInput("admin.errors.page", {
      site_id,
      search: "A".repeat(64),
    }),
  ).toMatchObject({ p_search: "a".repeat(64), p_offset: 0 });
  expect(() =>
    errorManagementInput("admin.error.delete", {
      site_id,
      id: site_id,
      expected_count: 1,
      status: "open",
    }),
  ).toThrow();
  expect(() =>
    errorManagementInput("admin.error.status", {
      site_id,
      id: site_id,
      expected_count: 1,
      status: "ignored",
    }),
  ).toThrow();
});

it("validates site-only summary requests in gateway and client", () => {
  expect(
    errorManagementInput("admin.errors.summary", { site_id }),
  ).toMatchObject({
    p_site_id: site_id,
  });
  for (const input of [
    { site_id: "invalid" },
    { site_id, actor: site_id },
    { site_id, limit: 20 },
  ]) {
    expect(() => errorManagementInput("admin.errors.summary", input)).toThrow();
    expect(
      actionContracts["admin.errors.summary"].input.safeParse(input).success,
    ).toBe(false);
  }
});

it("versions grouping, separates operations/causes and normalizes dynamic numbers", () => {
  const report = {
    app: "admin",
    environment: "production",
    source: "browser",
    route: "/write/:id",
    error_name: "TypeError",
    code: "api_failure",
    operation: "admin.post.save",
    dependency: "travel_api",
    http_status: 500,
    masked_message: "Failed after 123 ms",
    release: "old",
  };
  expect(errorFingerprintParts(report)).toEqual(
    errorFingerprintParts({
      ...report,
      masked_message: "Failed after 456 ms",
      release: "new",
    }),
  );
  expect(errorFingerprintParts(report)).not.toEqual(
    errorFingerprintParts({ ...report, operation: "admin.post.publish" }),
  );
  expect(errorFingerprintParts(report)).not.toEqual(
    errorFingerprintParts({
      ...report,
      masked_message: "Cannot read property title",
    }),
  );
  expect(errorFingerprintParts(report)[0]).toBe(2);
});
it("validates all shared dashboard filters", () => {
  for (const action of [
    "admin.errors.page",
    "admin.errors.summary",
    "admin.errors.health",
  ] as const) {
    const input = {
      site_id,
      app: "web",
      environment: "production",
      period: "24h",
    };
    expect(errorManagementInput(action, input)).toMatchObject({
      app: "web",
      environment: "production",
      period: "24h",
    });
    expect(actionContracts[action].input.safeParse(input).success).toBe(true);
    expect(() =>
      errorManagementInput(action, { ...input, period: "30d" }),
    ).toThrow();
  }
});
