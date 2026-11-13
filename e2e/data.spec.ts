import { test, expect } from "@playwright/test";
import { writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { buildMonthlyFile } from "../tests/fixtures/monthly";
import { loginAsAli, loginAsBoss } from "./fixtures";

test("السفير بيرفع ملف الشهر: معاينة، حفظ، والخطوط بتظهر", async ({ page }) => {
  const dir = mkdtempSync(path.join(tmpdir(), "av-"));
  const file = path.join(dir, "visits-11.xlsx");
  writeFileSync(file, await buildMonthlyFile());

  await loginAsAli(page);
  await page.goto("/admin/import");
  await page.getByLabel("الشهر").fill("2026-11");
  await page.getByLabel("ملف الإكسل").setInputFiles(file);
  await page.getByRole("button", { name: "معاينة" }).click();

  await expect(page.locator(".stat").filter({ hasText: "خطوط جديدة" })).toContainText("4");
  await expect(page.getByRole("cell", { name: "الزيارات الإجماليه" }).first()).toBeVisible();
  await expect(page.getByText("سجل الإدارة").first()).toBeVisible();
  await expect(page.getByText("بدون Line Code صالح")).toBeVisible();

  await page.getByRole("button", { name: "حفظ ملف شهر 2026-11" }).click();
  await expect(page.getByRole("status")).toContainText("انحفظ ملف شهر 2026-11");
  await expect(page.locator("table").last()).toContainText("visits-11.xlsx");

  await page.goto("/admin/lines?q=G-1000-001");
  await expect(page.locator("tbody")).toContainText("مقهى الاختبار");
  await expect(page.locator("tbody")).toContainText("الجنوب");

  // الحساب الطارئ
  await page.goto("/admin/lines");
  await page.getByRole("button", { name: "إضافة خط طارئ" }).click();
  await page.getByLabel("Line Code", { exact: true }).fill("g 9999 001");
  await page.getByLabel("اسم الحساب", { exact: true }).fill("حساب طارئ بالإيميل");
  await page.getByLabel("المكان (Locality)").fill("دير البلح");
  await page.getByRole("button", { name: "إضافة", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("انضاف الخط");
  await page.goto("/admin/lines?filter=manual");
  await expect(page.locator("tbody")).toContainText("حساب طارئ بالإيميل");
  await expect(page.locator("tbody")).toContainText("مضاف يدوياً");
});

test("القوائم: السفير بيضيف وبيوقف، والقيمة الموقوفة بتنزل لتحت", async ({ page }) => {
  await loginAsAli(page);
  await page.goto("/admin/lists");
  const actions = page.locator('[data-list="ACTION"]');
  await actions.getByLabel("قيمة جديدة لـ الإجراء المطبق").fill("تم التبليغ بالإيميل");
  await actions.getByRole("button", { name: "إضافة" }).click();
  const row = actions.locator(".list-row", { hasText: "تم التبليغ بالإيميل" });
  await expect(row).toBeVisible();
  await row.getByRole("button", { name: "إيقاف" }).click();
  await expect(actions.locator("details")).toContainText("تم التبليغ بالإيميل");
});

test("المسؤول بيشوف الخطوط والقوائم وملف الشهر للقراءة بس", async ({ page, baseURL }) => {
  await loginAsBoss(page);
  await page.goto("/admin/import");
  await expect(page.getByRole("heading", { name: "ملف الشهر" })).toBeVisible();
  await expect(page.getByLabel("ملف الإكسل")).toHaveCount(0);
  await page.goto("/admin/lines");
  await expect(page.getByRole("button", { name: "إضافة خط طارئ" })).toHaveCount(0);
  await page.goto("/admin/lists");
  await expect(page.getByText("للاطلاع فقط")).toBeVisible();
  await expect(page.getByRole("button", { name: "إيقاف" })).toHaveCount(0);

  const o = { Origin: baseURL! };
  // واحد ورا التاني: الرفض بيصير قبل قراءة الملف المرفوع، فالطلبات المتوازية ممكن تقطع اتصال بعض
  const calls = [
    () => page.request.post("/api/lines", { headers: o, data: { code: "G-1-001", accountName: "تسلل" } }),
    () => page.request.post("/api/lists", { headers: o, data: { kind: "ACTION", label: "تسلل" } }),
    () => page.request.post("/api/import/preview", { headers: o, multipart: { month: "2026-11" } }),
    () => page.request.post("/api/import", { headers: o, multipart: { month: "2026-11" } }),
  ];
  for (const call of calls) expect((await call()).status()).toBe(403);
});
