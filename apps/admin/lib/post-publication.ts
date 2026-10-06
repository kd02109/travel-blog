function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, child]) => child !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, canonicalize(child)]),
    );
  }
  return value;
}

export function hasUnpublishedChanges(
  savedDraft: Record<string, unknown>,
  publishedSnapshot: Record<string, unknown>,
): boolean {
  return (
    JSON.stringify(canonicalize(savedDraft)) !==
    JSON.stringify(canonicalize(publishedSnapshot))
  );
}
