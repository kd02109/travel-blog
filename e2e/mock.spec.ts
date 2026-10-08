import { expect, test } from "@playwright/test";
const site_id = "10000000-0000-4000-8000-000000000001";

test("public home shows its categories with fixture data", async ({ page }) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "오늘도 함께 걷다", exact: true }),
  ).toBeVisible();
  await expect(
    page
      .getByRole("list", { name: "여행 기록 분류" })
      .getByRole("link", { name: /여행 일정표/ }),
  ).toHaveAttribute("href", "/posts?category=itinerary-pdf");
});

test("mock mode does not bypass administrator login", async ({ page }) => {
  await page.goto("http://localhost:3012/posts");
  await expect(page).toHaveURL("http://localhost:3012/login");
  await expect(
    page.getByRole("button", { name: "카카오 로그인" }),
  ).toBeVisible();
});

for (const port of [3010, 3012]) {
  test(`Mirage intercepts native fetch, Axios and BFF on ${port}`, async ({
    page,
  }) => {
    const leaked: string[] = [];
    page.on("request", (request) => {
      if (request.url().includes("supabase.co")) leaked.push(request.url());
    });
    await page.goto(`http://localhost:${port}/mock`);
    await expect(
      page.getByRole("heading", {
        name: "서울숲에서 천천히 걸었던 하루",
        exact: true,
      }),
    ).toBeVisible();
    const native = await page.evaluate(async (site_id) => {
      const r = await fetch(
        "https://mock-test.supabase.co/functions/v1/travel-api",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "posts.list", input: { site_id } }),
        },
      );
      const site = await fetch("/api/site").then((r) => r.json());
      return { status: r.status, posts: await r.json(), site };
    }, site_id);
    expect(native.status).toBe(200);
    expect(native.posts).toHaveLength(5);
    expect(native.site.settings.template_id).toBe("D");
    expect(leaked).toEqual([]);
    await page.getByLabel("역할", { exact: true }).selectOption("owner");
    await page.getByRole("button", { name: "홈 A 적용", exact: true }).click();
    await expect(page.getByTestId("template")).toHaveText("A");
    await page.getByRole("button", { name: "데이터 초기화" }).click();
    await expect(page.getByTestId("template")).toHaveText("D");
    await page
      .getByLabel("카테고리", { exact: true })
      .selectOption("itinerary-pdf");
    const cards = page.locator("main ul.grid > li");
    await expect(cards).toHaveCount(1);
    await expect(cards).not.toContainText("좋아요");
    await page.getByLabel("상태", { exact: true }).selectOption("empty");
    await expect(page.getByText("등록된 여행 기록이 없습니다.")).toBeVisible();
    await page.getByLabel("상태", { exact: true }).selectOption("rate-limited");
    await expect(page.getByTestId("result")).toHaveText("rate_limited");
  });
}
test("HTTP errors, authorization, malformed JSON and no real network fallback", async ({
  page,
}) => {
  await page.goto("/mock");
  await expect(
    page.getByRole("heading", {
      name: "서울숲에서 천천히 걸었던 하루",
      exact: true,
    }),
  ).toBeVisible();
  const results = await page.evaluate(async (site_id) => {
    const endpoint = "/__mock__/functions/v1/travel-api";
    const unauthorized = await fetch(endpoint, {
      method: "POST",
      body: JSON.stringify({ action: "admin.posts", input: { site_id } }),
    });
    const invalid = await fetch(endpoint, { method: "POST", body: "{broken" });
    return {
      unauthorized: unauthorized.status,
      error: await unauthorized.json(),
      invalid: invalid.status,
    };
  }, site_id);
  expect(results).toMatchObject({
    unauthorized: 401,
    error: { error: "login_required" },
    invalid: 400,
  });
  await page.getByRole("button", { name: "관리자 목록 조회" }).click();
  await expect(page.getByTestId("result")).toHaveText("login_required");
  await page.getByLabel("역할", { exact: true }).selectOption("reader");
  await page.getByRole("button", { name: "관리자 목록 조회" }).click();
  await expect(page.getByTestId("result")).toHaveText("forbidden");
});
test("unhandled Supabase paths never fall through to the network", async ({
  page,
}) => {
  const escaped: string[] = [];
  await page.route("https://mock-test.supabase.co/**", async (route) => {
    escaped.push(route.request().url());
    await route.abort();
  });
  await page.goto("/mock");
  await expect(
    page.getByRole("heading", {
      name: "서울숲에서 천천히 걸었던 하루",
      exact: true,
    }),
  ).toBeVisible();
  const result = await page.evaluate(async () => {
    try {
      await fetch("https://mock-test.supabase.co/rest/v1/private-table");
      return "unexpected-success";
    } catch {
      return "blocked";
    }
  });
  expect(result).toBe("blocked");
  expect(escaped).toEqual([]);
});
test("typed query list/detail and successful comment mutation refresh", async ({
  page,
}) => {
  await page.goto("/posts");
  await expect(
    page.getByRole("link", { name: "서울숲에서 천천히 걸었던 하루" }),
  ).toBeVisible();
  await page
    .getByRole("link", { name: "서울숲에서 천천히 걸었던 하루" })
    .click();
  await expect(
    page.getByRole("heading", { name: "서울숲에서 천천히 걸었던 하루" }),
  ).toBeVisible();
  await page.getByLabel("이름", { exact: true }).fill("테스트 독자");
  await page
    .getByRole("textbox", { name: "댓글", exact: true })
    .fill("입력 보존 확인");
  await page.getByLabel(/^댓글 관리 비밀번호/).fill("test-only-password");
  await page.getByRole("button", { name: "댓글 등록", exact: true }).click();
  await expect(
    page.getByRole("listitem").filter({ hasText: "입력 보존 확인" }),
  ).toBeVisible();
  await expect(page.locator("#comments").getByRole("status")).toHaveCount(0);
  await expect(
    page.getByRole("textbox", { name: "댓글", exact: true }),
  ).toHaveValue("");
});
test("public pages show a retry action when their API is unavailable", async ({
  page,
}) => {
  await page.goto("/?mockScenario=error");
  await expect(
    page.getByRole("heading", { name: "여행 기록에 연결하지 못했어요" }),
  ).toBeVisible({ timeout: 15000 });
  await expect(
    page
      .getByRole("alert")
      .filter({ hasText: "여행 기록에 연결하지 못했어요" })
      .getByRole("button", { name: "다시 시도" }),
  ).toBeVisible();

  await page.goto("/posts?mockScenario=error");
  await expect(
    page.getByRole("heading", { name: "여행 기록에 연결하지 못했어요" }),
  ).toBeVisible({ timeout: 15000 });
  await expect(
    page
      .getByRole("alert")
      .filter({ hasText: "여행 기록에 연결하지 못했어요" })
      .getByRole("button", { name: "다시 시도" }),
  ).toBeVisible();
  await expect(
    page.getByText("아직 여행 기록이 없어요", { exact: true }),
  ).toHaveCount(0);
});
test("rate limits show a countdown before retry", async ({ page }) => {
  await page.goto("/posts?mockScenario=rate-limited");
  await expect(
    page.getByRole("heading", { name: "여행 기록에 연결하지 못했어요" }),
  ).toBeVisible({ timeout: 15000 });
  await expect(
    page.getByRole("button", { name: /초 후 다시 시도/ }),
  ).toBeDisabled();
});
test("conflict keeps comment input and offers explicit recovery", async ({
  page,
}) => {
  await page.goto("/posts/example-day-walk?mockScenario=conflict");
  await expect(
    page.getByRole("heading", { name: "서울숲에서 천천히 걸었던 하루" }),
  ).toBeVisible();
  await page.getByLabel("이름", { exact: true }).fill("테스트 독자");
  await page
    .getByRole("textbox", { name: "댓글", exact: true })
    .fill("실패해도 남아 있는 입력");
  await page.getByLabel(/^댓글 관리 비밀번호/).fill("test-only-password");
  await page.getByRole("button", { name: "댓글 등록", exact: true }).click();
  await expect(
    page
      .getByRole("alert")
      .filter({ hasText: "최신 상태를 불러온 뒤 다시 시도해 주세요." }),
  ).toBeVisible();
  await expect(
    page.getByRole("textbox", { name: "댓글", exact: true }),
  ).toHaveValue("실패해도 남아 있는 입력");
  await expect(
    page.getByRole("button", { name: "최신 내용 확인" }),
  ).toBeVisible();
});
test("slow responses show pending state and disable duplicate comment submission", async ({
  page,
}) => {
  await page.goto("/posts/example-day-walk?mockScenario=slow", {
    waitUntil: "domcontentloaded",
  });
  await expect(
    page.getByRole("status", { name: "여행 기록을 불러오는 중" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "서울숲에서 천천히 걸었던 하루" }),
  ).toBeVisible({ timeout: 15000 });
  await page.getByLabel("이름", { exact: true }).fill("테스트 독자");
  await page
    .getByRole("textbox", { name: "댓글", exact: true })
    .fill("한 번만 등록");
  await page.getByLabel(/^댓글 관리 비밀번호/).fill("test-only-password");
  await page.getByRole("button", { name: "댓글 등록", exact: true }).click();
  await expect(page.getByRole("button", { name: "등록 중…" })).toBeDisabled();
  await expect(
    page.getByRole("listitem").filter({ hasText: "한 번만 등록" }),
  ).toHaveCount(1, { timeout: 15000 });
});
