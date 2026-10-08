import { test, expect } from "@playwright/test";
test("static public notice and health endpoint", async ({ page, request }) => {
  await page.goto("/notice");
  await expect(
    page.getByRole("heading", { name: "저작권 및 이용 안내" }),
  ).toBeVisible();
  expect((await request.get("/api/health")).ok()).toBeTruthy();
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
