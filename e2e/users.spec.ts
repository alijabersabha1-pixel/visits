import { test, expect, type Browser } from "@playwright/test";
import { loginAs, loginAsAli, loginAsBoss } from "./fixtures";

async function newPage(browser: Browser) {
  const ctx = await browser.newContext();
  return ctx.newPage();
}

test("السفير بيضيف سفير، الجديد بيدخل ويغيّر كلمة سره، وبعدين علي بيوقفه", async ({ page, browser }) => {
  // 1) علي (سفير) بيضيف سفير
  await loginAsAli(page);
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

  // 2) الجديد بيدخل فوراً وبينطلب منه يغيّر كلمة السر
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

  // 3) علي بيوقفه ← بيطلع فوراً
  await page.reload();
  await row.getByRole("button", { name: "إيقاف" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "إيقاف" }).click();
  await expect(row).toContainText("موقوف");
  await amb.goto("/");
  await expect(amb).toHaveURL(/\/login$/);
  expect((await amb.request.get("/api/me")).status()).toBe(401);

  // 4) كل هاد بالسجل، مع فلتر حسب الشخص
  await page.goto("/admin/audit");
  await expect(page.locator("table")).toContainText("أحمد السفير");
  await expect(page.locator("table")).toContainText("فعّال"); // حقل «فعّال»: نعم ← لا
  await page.getByLabel("الشخص").selectOption({ label: "أحمد السفير" });
  await page.getByRole("button", { name: "عرض" }).click();
  await expect(page).toHaveURL(/actor=/);
  await expect(page.locator("tbody")).toContainText("تغيير كلمة السر");
  await expect(page.locator("tbody td[data-label='الشخص']").filter({ hasText: "علي جبر" })).toHaveCount(0);
});

test("المسؤول بيشوف كل شي للقراءة، وما بيقدر يغيّر ولا شي (حتى بطلب مباشر = 403)", async ({ page, baseURL }) => {
  await loginAsBoss(page);
  await expect(page.locator(".sidebar")).toContainText("المستخدمون");
  await expect(page.locator(".sidebar")).toContainText("سجل التعديلات");

  await page.goto("/admin/users");
  await expect(page.getByText("للاطلاع فقط")).toBeVisible();
  await expect(page.getByRole("button", { name: "إضافة مستخدم" })).toHaveCount(0);
  await expect(page.locator('tr[data-username="ali"]')).toContainText("علي جبر");
  await expect(page.locator('tr[data-username="ali"]').getByRole("button")).toHaveCount(0);

  await page.goto("/admin/audit");
  await expect(page.getByRole("heading", { name: "سجل التعديلات" })).toBeVisible();

  const users = await page.request.get("/api/users");
  expect(users.status()).toBe(200);
  const ali = (await users.json()).users.find((u: { username: string }) => u.username === "ali");
  const attempts = [
    page.request.post("/api/users", {
      headers: { Origin: baseURL! },
      data: { username: "sneaky", displayName: "تسلل", role: "AMBASSADOR" },
    }),
    page.request.patch(`/api/users/${ali.id}`, { headers: { Origin: baseURL! }, data: { active: false } }),
    page.request.post(`/api/users/${ali.id}/reset-password`, { headers: { Origin: baseURL! } }),
    page.request.post(`/api/users/${ali.id}/revoke-sessions`, { headers: { Origin: baseURL! } }),
  ];
  for (const res of await Promise.all(attempts)) expect(res.status()).toBe(403);

  // المسؤول بيقدر يغيّر كلمة سره هو
  await page.goto("/account/password");
  await expect(page.getByRole("heading", { name: "تغيير كلمة السر" })).toBeVisible();
});

test("طرد من كل الأجهزة (الجوال الضايع)", async ({ page, browser, baseURL }) => {
  await loginAsAli(page);
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

test("كلمة سر مؤقتة", async ({ page, browser }) => {
  await loginAsAli(page);
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
