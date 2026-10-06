import { expect, test } from "@playwright/test";

for (const port of [3000, 3002]) {
  test(`OAuth feedback and logout protection on ${port}`, async ({
    page,
    request,
  }) => {
    const origin = `http://localhost:${port}`;
    const publicWeb = port === 3000;
    const dialog = page.getByRole("dialog", { name: "로그인" });
    const alert = (publicWeb ? dialog : page.getByRole("main")).getByRole(
      "alert",
    );
    await page.goto(
      `${origin}/auth/callback?error=access_denied&error_description=private-detail`,
    );
    if (publicWeb) {
      await expect(page).toHaveURL(
        (url) =>
          url.pathname === "/notice" &&
          url.searchParams.get("login") === "1" &&
          url.searchParams.get("error") === "cancelled",
      );
      await expect(dialog).toBeVisible();
    } else {
      await expect(page).toHaveURL(`${origin}/login?error=cancelled`);
    }
    await expect(alert).toContainText("취소했습니다");
    await expect(page.locator("body")).not.toContainText("private-detail");
    await page.goto(`${origin}/auth/callback`);
    await expect(alert).toContainText("완료하지 못했습니다");
    await page.goto(
      `${origin}/auth/callback?error=invalid_client&error_description=private-detail`,
    );
    if (publicWeb) {
      await expect(page).toHaveURL(
        (url) =>
          url.pathname === "/notice" &&
          url.searchParams.get("login") === "1" &&
          url.searchParams.get("error") === "oauth_setup",
      );
    } else {
      await expect(page).toHaveURL(`${origin}/login?error=oauth_setup`);
    }
    await expect(alert).toContainText("로그인 설정 확인");
    await expect(page.locator("body")).not.toContainText("private-detail");
    await page.goto(`${origin}/auth/callback?error=over_request_rate_limit`);
    await expect(alert).toContainText("요청이 너무 많습니다");
    await page.goto(`${origin}/login?error=expired`);
    await expect(alert).toContainText("만료되었습니다");
    await expect(
      page.getByRole("button", { name: "카카오 로그인" }),
    ).toBeVisible();
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
    if (port === 3002) {
      await expect(
        page.getByRole("button", { name: "현재 계정 로그아웃" }),
      ).toHaveCount(0);
      await page.goto(`${origin}/login`);
      await expect(alert).toContainText("인증 서비스에 연결하지 못했습니다");
      await page.getByRole("button", { name: "카카오 로그인" }).click();
      // This suite deliberately runs without Supabase credentials.
      await expect(alert).toHaveCount(1);
      await expect(alert).toContainText("로그인 설정 확인");
    } else {
      await expect(
        page.getByRole("button", { name: "현재 계정 로그아웃" }),
      ).toHaveCount(0);
      await page.goto(`${origin}/login`);
      await expect(dialog).toBeVisible();
      await page.getByRole("button", { name: "카카오 로그인" }).click();
      // This suite deliberately runs without Supabase credentials.
      await expect(alert).toContainText("로그인을 시작하지 못했습니다");
    }
  });
}

test("legacy web sign-out links return home without opening login", async ({
  page,
}) => {
  const origin = "http://localhost:3000";
  const dialog = page.getByRole("dialog", { name: "로그인" });
  await page.goto(`${origin}/login?status=signed_out`);
  await expect(page).toHaveURL(`${origin}/`);
  await expect(dialog).toBeHidden();

  await page.goto(`${origin}/?login=1&status=signed_out`);
  await expect(page).toHaveURL(`${origin}/`);
  await expect(dialog).toBeHidden();
});

test("forbidden page offers recovery", async ({ page }) => {
  await page.goto("http://localhost:3002/forbidden");
  await expect(page.getByRole("heading")).toHaveText("관리 권한이 없습니다");
  await expect(
    page.getByRole("button", { name: "다른 계정으로 로그인" }),
  ).toBeVisible();
});
