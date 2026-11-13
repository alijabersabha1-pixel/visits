import { test, expect } from "@playwright/test";
import ExcelJS from "exceljs";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { loginAsAli, loginAsBoss } from "./fixtures";

async function sheetRows(path: string) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load((await readFile(path)) as unknown as ArrayBuffer);
  const rows: unknown[][] = [];
  wb.worksheets[0].eachRow((r) => rows.push((r.values as unknown[]).slice(1)));
  return { rows, rtl: wb.worksheets[0].views[0]?.rightToLeft };
}

test("المسؤول بيصدّر الزيارات المحددة Excel، وكل النتيجة PDF، وتقرير خط", async ({ browser, baseURL }) => {
  // السفير بيسجّل زيارتين
  const aliCtx = await browser.newContext();
  const ali = await aliCtx.newPage();
  await loginAsAli(ali);
  const boot = await (await ali.request.get("/api/m/bootstrap")).json();
  const rec = boot.recommendations[0].id;
  for (const code of ["G-8181-001", "G-8181-002"]) {
    const r = await ali.request.post("/api/sync", {
      headers: { Origin: baseURL! },
      data: {
        uuid: randomUUID(),
        kind: "VISIT",
        filledAt: new Date().toISOString(),
        payload: { lineCode: code, specialCase: false, accountName: "محل التصدير", recommendationId: rec, companionIds: [], photos: [], mikrotik: [], tests: "فحص للتصدير" },
      },
    });
    expect(r.status()).toBe(201);
  }
  await aliCtx.close();

  const ctx = await browser.newContext({ acceptDownloads: true });
  const page = await ctx.newPage();
  await loginAsBoss(page);
  await page.goto("/visits?q=G-8181");
  await expect(page.locator("tbody tr")).toHaveCount(2);

  // زيارة وحدة محددة ← Excel فيه صف واحد
  await page.locator("tbody tr").first().getByRole("checkbox").check();
  const [xlsx] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Excel" }).click()]);
  // ملف xlsx حقيقي (zip). اسم الملف بيوصل بـ Content-Disposition، وPlaywright ما بيقرأ filename* العربي
  expect((await readFile((await xlsx.path())!)).subarray(0, 2).toString()).toBe("PK");
  const { rows, rtl } = await sheetRows((await xlsx.path())!);
  expect(rtl).toBe(true);
  expect(rows).toHaveLength(2);
  expect(rows[0].slice(0, 4)).toEqual(["م.", "التاريخ", "الحساب", "الكود"]);
  expect(String(rows[1][3])).toMatch(/^G-8181-00[12]$/);

  // بدون تحديد ← كل نتيجة الفلتر، PDF
  await page.reload();
  const [pdf] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "PDF جدول" }).click()]);
  const bytes = await readFile((await pdf.path())!);
  expect(bytes.subarray(0, 5).toString()).toBe("%PDF-");
  expect(bytes.length).toBeGreaterThan(5_000);

  // صفحة الطباعة نفسها: الزيارتين بالجدول
  await page.goto("/print/visits?q=G-8181");
  await expect(page.locator("tbody tr")).toHaveCount(2);
  await expect(page.getByRole("img", { name: "جوال" })).toBeVisible();

  // تقرير خط واحد
  const line = await page.request.get("/api/export/line?code=G-8181-001&format=pdf");
  expect(line.status()).toBe(200);
  expect(line.headers()["content-type"]).toBe("application/pdf");

  // تقرير البطاقات Excel
  const month = new Date().toISOString().slice(0, 7);
  const cards = await page.request.get(`/api/export/cards?month=${month}`);
  expect(cards.status()).toBe(200);
  await ctx.close();
});

test("بدون دخول: التصدير وصفحات الطباعة ممنوعة", async ({ page, request }) => {
  expect((await request.get("/api/export/visits?format=xlsx")).status()).toBe(401);
  await page.goto("/print/visits");
  await expect(page).toHaveURL(/\/login$/);
});
