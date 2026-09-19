export const SITE_NAME = "오늘도 함께 걷다";
export const SITE_SLUG = "parents-travel";
export const CATEGORIES = [
  { code: "day-walk", label: "하루 걷기" },
  { code: "overnight-trip", label: "머무는 여행" },
  { code: "food-cafe", label: "맛과 커피" },
  { code: "stay-review", label: "머문 숙소" },
  { code: "itinerary-pdf", label: "여행 일정표" },
] as const;
export type CategoryCode = (typeof CATEGORIES)[number]["code"];
export const CATEGORY_CODES = CATEGORIES.map((category) => category.code) as [
  CategoryCode,
  ...CategoryCode[],
];
export const STAFF_ROLES = ["owner", "admin", "editor"] as const;
export function allowsReactions(category: CategoryCode) {
  return category !== "itinerary-pdf";
}
