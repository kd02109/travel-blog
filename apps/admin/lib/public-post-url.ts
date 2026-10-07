export function resolvePublicSiteOrigin(
  configuredOrigin: string | undefined,
  isDevelopment: boolean,
): string | null {
  const candidate =
    configuredOrigin?.trim() || (isDevelopment ? "http://localhost:3000" : "");
  if (!candidate) return null;

  try {
    const url = new URL(candidate);
    if (
      (isDevelopment
        ? !["http:", "https:"].includes(url.protocol)
        : url.protocol !== "https:") ||
      url.username ||
      url.password ||
      url.pathname !== "/" ||
      url.search ||
      url.hash
    )
      return null;
    return url.origin;
  } catch {
    return null;
  }
}

export function publicPostUrl(
  publicSiteOrigin: string | null,
  publishedSlug: string | null,
): string | null {
  if (!publicSiteOrigin || !publishedSlug) return null;
  return new URL(
    `/posts/${encodeURIComponent(publishedSlug)}`,
    publicSiteOrigin,
  ).href;
}
