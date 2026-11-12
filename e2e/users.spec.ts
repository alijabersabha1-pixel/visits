import { test, expect, type Browser } from "@playwright/test";
import { loginAs, loginAsAdmin } from "./fixtures";

async function newPage(browser: Browser) {
  const ctx = await browser.newContext();
  return ctx.newPage();
}

test("المسؤول بيضيف سفير، السفير بيدخل ويغيّر كلمة سره، وبعدين المسؤول بيوقفه", async ({ page, browser, baseURL }) => {
  // 1) المسؤول بيضيف سفير
  await loginAsAdmin(page);
  await page.goto("/admin/users");
  await page.getByRole("button", { name: "إضافة مستخدم" }).click();
  const add = page.getByRole("dialog");
  await add.getByLabel("الاسم").fill("أحمد السفير");
  await add.getByLabel("اسم الدخول").fill("Ahmad.S");
  await add.getByRole("button", { name: "إضافة" }).click();
  const temp = (await page.getByTestId("temp-password").innerText()).trim();
  expect(temp).toMatch(/^[A-Za-z2-9]{10}$/);
  await page.getByRole("button", { name: "تمام" }).click();
  const row = page.locator('tr[data-username="ahmad.s"]');
  await expect(row).toContainText("أحمد السفير");
  await expect(row).toContainText("بانتظار تغيير كلمة السر");

  // 2) السفير بيدخل فوراً وبينطلب منه يغيّر كلمة السر
  const amb = await newPage(browser);
  await loginAs(amb, "ahmad.s", temp);
  await expect(amb).toHaveURL(/\/account\/password$/);
  await amb.goto("/");
  await expect(amb).toHaveURL(/\/account\/password$/); // ما بيقدر يتجاوزها
  await amb.getByLabel("كلمة السر الحالية").fill(temp);
  await amb.getByLabel("كلمة السر الجديدة", { exact: true }).fill("ahmad-new-pass");
  await amb.getByLabel("أعد كتابة كلمة السر الجديدة").fill("ahmad-new-pass");
  await amb.getByRole("button", { name: "حفظ" }).click();
  await expect(amb.getByText("تغيّرت كلمة السر")).toBeVisible();
  await amb.goto("/");
  await expect(amb.getByRole("heading", { name: "أهلاً أحمد السفير" })).toBeVisible();

  // 3) السفير ما بيشوف صفحات الإدارة، ولا بيوصل لواجهتها البرمجية (403)
  await expect(amb.getByRole("link", { name: "المستخدمون" })).toHaveCount(0);
  await amb.goto("/admin/users");
  await expect(amb).toHaveURL(/\/\?denied=1$/);
  await amb.goto("/admin/audit");
  await expect(amb).toHaveURL(/\/\?denied=1$/);
  const api = await amb.request.get("/api/users");
  expect(api.status()).toBe(403);
  const post = await amb.request.post("/api/users", {
    headers: { Origin: baseURL! },
    data: { username: "sneaky", displayName: "تسلل", role: "ADMIN" },
  });
  expect(post.status()).toBe(403);

  // 4) المسؤول بيوقفه ← بيطلع فوراً
  await page.reload();
  await row.getByRole("button", { name: "إيقاف" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "إيقاف" }).click();
  await expect(row).toContainText("موقوف");
  await amb.goto("/");
  await expect(amb).toHaveURL(/\/login$/);
  expect((await amb.request.get("/api/me")).status()).toBe(401);

  // 5) كل هاد بالسجل
  await page.goto("/admin/audit");
  const log = page.locator("table");
  await expect(log).toContainText("أحمد السفير");
  await expect(log).toContainText("فعّال"); // حقل «فعّال»: نعم ← لا
  await page.getByLabel("الشخص").selectOption({ label: "أحمد السفير" });
  await page.getByRole("button", { name: "عرض" }).click();
  await expect(page).toHaveURL(/actor=/);
  await expect(page.locator("tbody tr").first()).toContainText("أحمد السفير");
  await expect(page.locator("tbody")).toContainText("تغيير كلمة السر");
  await expect(page.locator("tbody")).not.toContainText("علي جبر");
});

test("طرد من كل الأجهزة (الجوال الضايع)", async ({ page, browser, baseURL }) => {
  await loginAsAdmin(page);
  const res = await page.request.post("/api/users", {
    headers: { Origin: baseURL! },
    data: { username: "lost.phone", displayName: "جوال ضايع", role: "AMBASSADOR", password: "lost-phone-1" },
  });
  expect(res.status()).toBe(201);

  const phone = await newPage(browser);
  await loginAs(phone, "lost.phone", "lost-phone-1");
  await expect(phone).toHaveURL(/\/account\/password$/);

  await page.goto("/admin/users");
  const row = page.locator('tr[data-username="lost.phone"]');
  await row.getByRole("button", { name: "طرد من كل الأجهزة" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "طرد من كل الأجهزة" }).click();
  await expect(page.getByRole("status")).toContainText("انلغت 1 جلسة");

  await phone.reload();
  await expect(phone).toHaveURL(/\/login$/);
});

test("كلمة سر مؤقتة من المسؤول", async ({ page, browser }) => {
  await loginAsAdmin(page);
  await page.goto("/admin/users");
  const row = page.locator('tr[data-username="lost.phone"]');
  await row.getByRole("button", { name: "كلمة سر مؤقتة" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "أعطيه كلمة سر مؤقتة" }).click();
  const temp = (await page.getByTestId("temp-password").innerText()).trim();

  const p = await newPage(browser);
  await loginAs(p, "lost.phone", "lost-phone-1");
  await expect(p.locator(".alert-error")).toContainText("غلط");
  await loginAs(p, "lost.phone", temp);
  await expect(p).toHaveURL(/\/account\/password$/);
});
