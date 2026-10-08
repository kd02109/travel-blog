import type { CategoryCode } from "@repo/constants";

export type ArticleCategory = Exclude<CategoryCode, "itinerary-pdf">;
export type PostMetadata = Record<string, unknown>;

function text(metadata: PostMetadata, key: string) {
  const value = metadata[key];
  return typeof value === "string" ? value.trim() : "";
}

export function isIsoDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return (
    !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value
  );
}

/** Checks entered values while still allowing a deliberately incomplete draft. */
export function validateDraftMetadata(
  category: ArticleCategory,
  metadata: PostMetadata,
) {
  const dates =
    category === "overnight-trip"
      ? ["start_date", "end_date"]
      : category === "stay-review"
        ? ["check_in", "check_out"]
        : ["visited_on"];
  if (
    dates.some((key) => text(metadata, key) && !isIsoDate(text(metadata, key)))
  )
    return "invalid_date";
  const [startKey, endKey] = dates;
  const start = text(metadata, startKey!);
  const end = endKey ? text(metadata, endKey) : "";
  if (start && end && end <= start) return "invalid_dates";
  if (
    category === "food-cafe" &&
    text(metadata, "venue_type") &&
    !["cafe", "restaurant"].includes(text(metadata, "venue_type"))
  )
    return "invalid_venue";
  return null;
}

/** Mirrors publication-time requirements enforced by the Supabase API. */
export function validatePublishedMetadata(
  category: ArticleCategory,
  metadata: PostMetadata,
) {
  if (!text(metadata, "region")) return "incomplete_article";
  const enteredValueError = validateDraftMetadata(category, metadata);
  if (enteredValueError && enteredValueError !== "invalid_venue") {
    return enteredValueError;
  }
  if (category === "day-walk" || category === "food-cafe") {
    if (!text(metadata, "visited_on")) return "missing_date";
  } else {
    const startKey = category === "overnight-trip" ? "start_date" : "check_in";
    const endKey = category === "overnight-trip" ? "end_date" : "check_out";
    if (!text(metadata, startKey) || !text(metadata, endKey))
      return "invalid_dates";
    if (text(metadata, endKey) <= text(metadata, startKey))
      return "invalid_dates";
  }
  if (
    (category === "food-cafe" || category === "stay-review") &&
    !text(metadata, "place_name")
  )
    return "missing_place";
  if (
    category === "food-cafe" &&
    !["cafe", "restaurant"].includes(text(metadata, "venue_type"))
  )
    return "invalid_venue";
  return null;
}
