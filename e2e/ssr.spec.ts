import { expect, test } from "@playwright/test";

test("renders list and pagination in initial HTML with JavaScript disabled", async ({
  page,
  request,
}) => {
  await page.goto("/posts");
  await expect(page.getByRole("heading", { name: "여행 기록" })).toBeVisible();
  await expect(
    page.locator('main ul > li > a[href^="/posts/ssr-trip-"]'),
  ).toHaveCount(12);
  await page.goto("/posts?page=2");
  await expect(page.getByRole("link", { name: /SSR 여행 13/ })).toBeVisible();
  await expect(
    page.locator('main ul > li > a[href^="/posts/ssr-trip-"]'),
  ).toHaveCount(1);
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

test("serves post-specific share metadata and a PNG image to crawlers", async ({
  page,
  request,
}) => {
  await page.goto("/posts/ssr-trip-1");
  await expect(page).toHaveTitle("SSR 여행 1");
  await expect(page.locator('meta[name="description"]')).toHaveAttribute(
    "content",
    "SSR 여행 1 · 서버에서 전달한 여행 본문",
  );
  await expect(page.locator('meta[property="og:title"]')).toHaveAttribute(
    "content",
    "SSR 여행 1",
  );
  await expect(page.locator('meta[property="og:description"]')).toHaveAttribute(
    "content",
    "SSR 여행 1 · 서버에서 전달한 여행 본문",
  );
  const firstImageUrl = await page
    .locator('meta[property="og:image"]')
    .getAttribute("content");
  expect(firstImageUrl).toBeTruthy();
  expect(new URL(firstImageUrl!).pathname).toBe("/og/ssr-trip-1");
  await expect(page.locator('meta[name="twitter:image"]')).toHaveAttribute(
    "content",
    firstImageUrl!,
  );
  const firstImage = await request.get(
    `http://localhost:3040${new URL(firstImageUrl!).pathname}`,
  );
  expect(firstImage.status()).toBe(200);
  expect(firstImage.headers()["content-type"]).toContain("image/png");
  const firstPng = await firstImage.body();
  expect(firstPng.subarray(0, 8)).toEqual(
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  );
  expect(firstPng.readUInt32BE(16)).toBe(1200);
  expect(firstPng.readUInt32BE(20)).toBe(630);

  await page.goto("/posts/ssr-trip-2");
  await expect(page).toHaveTitle("SSR 여행 2");
  await expect(page.locator('meta[name="description"]')).toHaveAttribute(
    "content",
    "SSR 여행 2 · 서버에서 전달한 여행 본문",
  );
  await expect(page.locator('meta[property="og:title"]')).toHaveAttribute(
    "content",
    "SSR 여행 2",
  );
  const secondImageUrl = await page
    .locator('meta[property="og:image"]')
    .getAttribute("content");
  expect(secondImageUrl).toBeTruthy();
  expect(new URL(secondImageUrl!).pathname).toBe("/og/ssr-trip-2");
  const secondImage = await request.get(
    `http://localhost:3040${new URL(secondImageUrl!).pathname}`,
  );
  expect(secondImage.status()).toBe(200);
  expect(secondImage.headers()["content-type"]).toContain("image/png");
  expect((await secondImage.body()).equals(firstPng)).toBe(false);
});

test("handles empty list and missing post on server", async ({ page }) => {
  await page.goto("/posts?page=3");
  await expect(
    page.getByRole("heading", { name: "아직 여행 기록이 없어요" }),
  ).toBeVisible();
  const response = await page.goto("/posts/does-not-exist");
  expect(response?.status()).toBe(404);
});
