import { test, expect, type Page, type Browser } from "@playwright/test";
import { loginAs, loginAsAli, loginAsBoss } from "./fixtures";

const SAMI = { username: "sami.v", name: "سامي", password: "sami-pass-123" };

async function api(page: Page, baseURL: string, method: "post" | "patch", url: string, data: unknown) {
  const res = await page.request[method](url, { headers: { Origin: baseURL }, data });
  expect(res.ok(), `${method} ${url}: ${await res.text()}`).toBeTruthy();
  return res.json();
}

async function samiPage(browser: Browser) {
  const p = await (await browser.newContext()).newPage();
  await loginAs(p, SAMI.username, SAMI.password);
  await p.waitForURL((u) => !u.pathname.startsWith("/login"));
  // كلمة سر أولية: لازم يغيّرها أول مرة
  if (p.url().includes("/account/password")) {
    await p.getByLabel("كلمة السر الحالية").fill(SAMI.password);
    await p.getByLabel("كلمة السر الجديدة", { exact: true }).fill(`${SAMI.password}-2`);
    await p.getByLabel("أعد كتابة كلمة السر الجديدة").fill(`${SAMI.password}-2`);
    await p.getByRole("button", { name: "حفظ" }).click();
    await expect(p.getByText("تغيّرت كلمة السر")).toBeVisible();
  }
  return p;
}

test.describe.serial("الزيارات من أولها لآخرها", () => {
  test("تجهيز: خط وسفير تاني", async ({ page, baseURL }) => {
    await loginAsAli(page);
    await api(page, baseURL!, "post", "/api/lines", {
      code: "G-7000-001",
      accountName: "مقهى الزيارات",
      locality: "غزة",
    });
    await api(page, baseURL!, "post", "/api/lines", {
      code: "G-7000-002",
      accountName: "مقهى الزيارات فرع",
      locality: "غزة",
    });
    await api(page, baseURL!, "post", "/api/users", { ...SAMI, displayName: SAMI.name, role: "AMBASSADOR" });
  });

  test("علي بيسجل زيارة: الحساب بيتعبّى لحاله، والتقرير بيتعدّل", async ({ page }) => {
    await loginAsAli(page);
    await page.goto("/visits/new");
    await page.getByLabel("Line Code", { exact: true }).fill("g 7000 001");
    await page.getByLabel("Line Code", { exact: true }).blur();
    await expect(page.getByLabel("اسم الحساب")).toHaveValue("مقهى الزيارات");
    await page.getByLabel("الفحوصات اللي تمت").fill("فحص الراوتر والمايكروتيك");
    await page.getByLabel("نتيجة الفحوصات").fill("إعادة بيع للجيران");
    await page.getByLabel("التوصية").selectOption({ label: "يوجد تجاوز" });
    await page.getByRole("button", { name: "حفظ الزيارة" }).click();
    await expect(page.getByRole("heading", { name: /زيارة #\d+/ })).toBeVisible();
    await expect(page.getByLabel("التقرير")).toContainText("إعادة بيع للجيران");
    await expect(page.getByLabel("السجل")).toContainText("سجّل الزيارة");

    await page.getByRole("link", { name: "تعديل التقرير" }).click();
    await page.getByLabel("نتيجة الفحوصات").fill("إعادة بيع لـ 3 بيوت");
    await page.getByRole("button", { name: "حفظ التعديل" }).click();
    await expect(page.getByLabel("التقرير")).toContainText("إعادة بيع لـ 3 بيوت");
    await expect(page.getByLabel("السجل")).toContainText("إعادة بيع للجيران");
  });

  test("سامي بيغيّر الحالة وبيطلب تعديل التقرير، وعلي بيوافق من طلبات التعديل", async ({ page, browser }) => {
    const sami = await samiPage(browser);
    await sami.goto("/visits");
    await sami.locator("tr", { hasText: "مقهى الزيارات" }).first().getByRole("link").first().click();
    // الحالة: أي سفير
    await sami.getByLabel("الإجراء المطبق").selectOption({ label: "تم تجميد الخدمة" });
    await sami.getByRole("button", { name: "حفظ الحالة" }).click();
    await expect(sami.getByText("انحفظت الحالة")).toBeVisible();
    // التقرير: طلب تعديل
    await expect(sami.getByRole("link", { name: "تعديل التقرير" })).toHaveCount(0);
    await sami.getByRole("link", { name: "طلب تعديل" }).click();
    await sami.getByLabel("الفحوصات اللي تمت").fill("فحص الراوتر والمايكروتيك وصندوق التوزيع");
    await sami.getByLabel("سبب التعديل").fill("نسينا صندوق التوزيع");
    await sami.getByRole("button", { name: "إرسال طلب التعديل" }).click();
    await expect(sami.getByText("انبعت طلب التعديل")).toBeVisible();

    await loginAsAli(page);
    await expect(page.locator(".sidebar").getByRole("link", { name: /طلبات التعديل/ })).toContainText("1");
    await page.goto("/inbox");
    await expect(page.getByText("نسينا صندوق التوزيع")).toBeVisible();
    await page.getByRole("button", { name: "موافقة" }).click();
    await expect(page.getByText("ما في طلبات بانتظارك")).toBeVisible();
    await page.goto("/visits/mine");
    await page.locator("tr", { hasText: "مقهى الزيارات" }).first().getByRole("link").first().click();
    await expect(page.getByLabel("التقرير")).toContainText("صندوق التوزيع");
    await expect(page.getByLabel("السجل")).toContainText("بموافقة علي جبر");
    await expect(page.getByLabel("السجل")).toContainText("سامي");
  });

  test("إعادة الزيارة: بتدخل القائمة، بتتأجل بسبب، وبتطلع لما تنسجل زيارة", async ({ page }) => {
    await loginAsAli(page);
    await page.goto("/visits/new?code=G-7000-002");
    await page.getByLabel("التوصية").selectOption({ label: "زيارة غير ناجحة" });
    await page.getByLabel("موعد مقترح لإعادة الزيارة (اختياري)").fill("2099-01-01");
    await page.getByRole("button", { name: "حفظ الزيارة" }).click();
    await expect(page.getByRole("heading", { name: /زيارة #\d+/ })).toBeVisible();

    await page.goto("/revisits");
    const row = page.locator('tr[data-revisit="G-7000-002"]');
    await expect(row).toBeVisible();
    await expect(page.getByRole("region", { name: "غزة" })).toContainText("G-7000-002");
    await row.getByRole("button", { name: "تأجيل" }).click();
    await row.getByLabel("سبب التأجيل").fill("المحل مسكر");
    await row.getByRole("button", { name: "تأجيل" }).click();
    await expect(row).toContainText("1 مرة");
    await expect(row).toContainText("المحل مسكر");

    await row.getByRole("link", { name: "سجّل الزيارة" }).click();
    await expect(page.getByText(/إعادة زيارة للزيارة رقم/)).toBeVisible();
    await expect(page.getByLabel("Line Code", { exact: true })).toHaveValue("G-7000-002");
    await page.getByLabel("التوصية").selectOption({ label: "لا يوجد تجاوز" });
    await page.getByRole("button", { name: "حفظ الزيارة" }).click();
    await expect(page.getByText(/إعادة زيارة لـ/)).toBeVisible();
    await page.goto("/revisits");
    await expect(page.locator('tr[data-revisit="G-7000-002"]')).toHaveCount(0);
  });

  test("البحث: بطاقة الخط وزياراته وخطوط نفس الحساب، والبحث الجماعي", async ({ page }) => {
    await loginAsAli(page);
    await page.goto("/search");
    await page.getByLabel("Line Code", { exact: true }).fill("g7000001");
    await page.getByRole("button", { name: "بحث" }).click();
    const card = page.getByRole("region", { name: "بطاقة الخط" });
    await expect(card).toContainText("مقهى الزيارات");
    await expect(card).toContainText("غزة");
    await expect(page.getByRole("region", { name: "الزيارات" })).toContainText("يوجد تجاوز");
    await page.getByRole("region", { name: "خطوط نفس الحساب" }).getByRole("link", { name: "G-7000-002" }).click();
    await expect(page.getByRole("region", { name: "الزيارات" })).toContainText("زيارة غير ناجحة");

    await page.goto("/search/bulk");
    await page.getByLabel(/الأكواد/).fill("G-7000-001\nG-0000-404\ng 7000 001");
    await page.getByRole("button", { name: "بحث" }).click();
    await expect(page.locator("tbody tr")).toHaveCount(3);
    await expect(page.locator("tbody tr").nth(0)).toContainText("موجود");
    await expect(page.locator("tbody tr").nth(1)).toContainText("غير موجود");
    await expect(page.locator("tbody tr").nth(2)).toContainText("مكرر");
  });

  test("الحذف لسلة المحذوفات والاسترجاع", async ({ page }) => {
    await loginAsAli(page);
    await page.goto("/visits?q=G-7000-002");
    const before = await page.locator("tbody tr").count();
    await page.locator("tbody tr").first().getByRole("link").first().click();
    page.once("dialog", (d) => d.accept());
    await page.getByRole("button", { name: "حذف" }).click();
    await expect(page.getByText("انحذفت الزيارة")).toBeVisible();
    await page.goto("/visits?q=G-7000-002");
    await expect(page.locator("tbody tr")).toHaveCount(before - 1);
    await page.goto("/admin/trash");
    await page.getByRole("button", { name: "استرجاع" }).first().click();
    await expect(page.getByText("السلة فاضية")).toBeVisible();
  });

  test("المسؤول بيشوف كل شي للقراءة، وأي تعديل مباشر = 403", async ({ page, baseURL }) => {
    await loginAsBoss(page);
    await expect(page.locator(".sidebar")).not.toContainText("زياراتي");
    await page.goto("/visits");
    await expect(page.getByRole("link", { name: "زيارة جديدة" })).toHaveCount(0);
    await page.locator("tr", { hasText: "مقهى الزيارات" }).first().getByRole("link").first().click();
    await page.waitForURL(/\/visits\/[0-9a-f-]{36}/);
    const id = page.url().split("/visits/")[1].split("?")[0];
    await expect(page.getByRole("button", { name: "حفظ الحالة" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "تعديل التقرير" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "طلب تعديل" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "حذف" })).toHaveCount(0);
    await page.goto("/revisits");
    await expect(page.getByRole("button", { name: "تأجيل" })).toHaveCount(0);

    const o = { Origin: baseURL! };
    const res = await Promise.all([
      page.request.post("/api/visits", {
        headers: o,
        data: { lineCode: "G-7000-001", visitedOn: "2026-11-01", recommendationId: id },
      }),
      page.request.patch(`/api/visits/${id}`, { headers: o, data: { report: { result: "x" } } }),
      page.request.patch(`/api/visits/${id}`, { headers: o, data: { status: { revisitDue: null } } }),
      page.request.delete(`/api/visits/${id}`, { headers: o }),
      page.request.post(`/api/visits/${id}/postpone`, { headers: o, data: { reason: "تسلل" } }),
      page.request.post(`/api/visits/${id}/edit-requests`, {
        headers: o,
        data: { changes: { result: "x" }, reason: "تسلل" },
      }),
    ]);
    for (const r of res) expect(r.status(), await r.text()).toBe(403);
  });
});
