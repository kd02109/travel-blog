import { describe, expect, it } from "vitest";
import { publicPostUrl, resolvePublicSiteOrigin } from "./public-post-url";

describe("public post URL", () => {
  it("uses the configured public origin and encodes the publication slug", () => {
    const origin = resolvePublicSiteOrigin("https://blog.example.com/", false);
    expect(origin).toBe("https://blog.example.com");
    expect(publicPostUrl(origin, "sea & walk")).toBe(
      "https://blog.example.com/posts/sea%20%26%20walk",
    );
  });

  it("only falls back to the local web app during development", () => {
    expect(resolvePublicSiteOrigin(undefined, true)).toBe(
      "http://localhost:3000",
    );
    expect(resolvePublicSiteOrigin(undefined, false)).toBeNull();
    expect(publicPostUrl(null, "published-slug")).toBeNull();
  });

  it("rejects malformed and non-origin configuration", () => {
    expect(resolvePublicSiteOrigin("javascript:alert(1)", false)).toBeNull();
    expect(
      resolvePublicSiteOrigin("http://blog.example.com", false),
    ).toBeNull();
    expect(
      resolvePublicSiteOrigin("https://blog.example.com/path", false),
    ).toBeNull();
    expect(
      resolvePublicSiteOrigin("https://user:pass@blog.example.com", false),
    ).toBeNull();
  });
});
