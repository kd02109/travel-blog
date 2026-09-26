import { expect, test } from "@playwright/test";

for (const port of [3000, 3002]) {
  test(`OAuth error pages and logout protection on ${port}`, async ({
    page,
    request,
  }) => {
    const origin = `http://localhost:${port}`;
    const alert = page.getByRole("main").getByRole("alert");
    await page.goto(
      `${origin}/auth/callback?error=access_denied&error_description=private-detail`,
    );
    await expect(page).toHaveURL(`${origin}/login?error=cancelled`);
    await expect(alert).toContainText("취소했습니다");
    await expect(page.locator("body")).not.toContainText("private-detail");
    await page.goto(`${origin}/auth/callback`);
    await expect(alert).toContainText("완료하지 못했습니다");
    await page.goto(`${origin}/login?error=expired`);
    await expect(alert).toContainText("만료되었습니다");
    await page.goto(`${origin}/login?error=__proto__`);
    await expect(alert).toContainText("완료하지 못했습니다");
    expect((await request.get(`${origin}/auth/signout`)).status()).toBe(405);
    expect(
      (
        await request.post(`${origin}/auth/signout`, {
          headers: { origin: "https://other.example" },
        })
      ).status(),
    ).toBe(403);
    await page.getByRole("button", { name: "현재 계정 로그아웃" }).click();
    // This suite deliberately runs without Supabase credentials.
    await expect(alert).toContainText("로그아웃하지 못했습니다");
  });
}

test("forbidden page offers recovery", async ({ page }) => {
  await page.goto("http://localhost:3002/forbidden");
  await expect(page.getByRole("heading")).toHaveText("관리 권한이 없습니다.");
  await expect(
    page.getByRole("button", { name: "현재 계정 로그아웃" }),
  ).toBeVisible();
});
