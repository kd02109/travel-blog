import { expect, test } from "@playwright/test";
test("renders list and pagination in initial HTML with JavaScript disabled", async ({
  page,
  request,
}) => {
  await page.goto("/posts");
  await expect(page.getByRole("heading", { name: "여행 기록" })).toBeVisible();
  await expect(page.getByRole("link", { name: /^SSR 여행 / })).toHaveCount(12);
  await page.goto("/posts?page=2");
  await expect(
    page.getByRole("link", { name: "SSR 여행 13", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: /^SSR 여행 / })).toHaveCount(1);
  const response = await request.get("http://127.0.0.1:3049/requests");
  const calls = await response.json();
  expect(calls).toContainEqual(
    expect.objectContaining({
      action: "posts.list",
      input: expect.objectContaining({ offset: 12 }),
      hasAuthorization: false,
    }),
  );
});
test("renders detail and body without browser Mirage or JavaScript", async ({
  page,
}) => {
  await page.goto("/posts/ssr-trip-1");
  await expect(
    page.getByRole("heading", { name: "SSR 여행 1", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("서버에서 전달한 여행 본문")).toBeVisible();
});
test("handles empty list and missing post on server", async ({ page }) => {
  await page.goto("/posts?page=3");
  await expect(page.getByText("여행 기록을 준비하고 있어요.")).toBeVisible();
  const response = await page.goto("/posts/does-not-exist");
  expect(response?.status()).toBe(404);
});
