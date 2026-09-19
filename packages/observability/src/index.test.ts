import { it, expect } from "vitest";
import { scrubEvent } from "./index";
it("removes request credentials, bodies, identity and callback query strings", () => {
  const event = scrubEvent({
    type: undefined,
    user: { email: "private@example.com" },
    extra: { draft: "private" },
    breadcrumbs: [{ message: "private" }],
    request: {
      url: "https://example.com/auth/callback?code=secret#token",
      headers: { Authorization: "secret" },
      cookies: { session: "secret" },
      data: "private",
      query_string: "code=secret",
    },
  });
  expect(event).toEqual({
    request: { url: "https://example.com/auth/callback" },
  });
});
