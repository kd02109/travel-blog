import { test, expect } from "@playwright/test";
test("public categories and health", async ({ page, request }) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "오늘도 함께 걷다", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "여행 일정표" }),
  ).toBeVisible();
  expect((await request.get("/api/health")).ok()).toBeTruthy();
});
test("editor preserves Korean text across preview", async ({ page }) => {
  await page.goto("http://localhost:3002/playground");
  const editor = page.locator('[contenteditable="true"]').first();
  await expect(editor).toBeVisible();
  await editor.fill("제주에서 함께 걸었던 하루");
  await page.getByRole("button", { name: "미리보기", exact: true }).click();
  await expect(
    page.getByRole("region", { name: "본문 미리보기" }),
  ).toContainText("제주에서 함께 걸었던 하루");
  await page.getByRole("button", { name: "이어서 쓰기" }).click();
  await expect(page.locator('[contenteditable="true"]').first()).toContainText(
    "제주에서 함께 걸었던 하루",
  );
});
test("anonymous visitors cannot open admin pages", async ({ page }) => {
  for (const path of [
    "/posts",
    "/comments",
    "/account-deletions",
    "/write",
    "/home-design",
  ]) {
    await page.goto(`http://localhost:3002${path}`);
    await expect(page).toHaveURL(/http:\/\/localhost:3002\/login(?:\?|$)/);
    await expect(
      page.getByRole("button", { name: "카카오 로그인" }),
    ).toBeVisible();
    await expect(
      page.getByRole("navigation", { name: "관리자 메뉴" }),
    ).toHaveCount(0);
  }
});

test("admin entry opens Kakao login", async ({ page }) => {
  await page.goto("http://localhost:3002/");
  await expect(page).toHaveURL(/http:\/\/localhost:3002\/login(?:\?|$)/);
  await expect(
    page.getByRole("button", { name: "카카오 로그인" }),
  ).toBeVisible();
});
