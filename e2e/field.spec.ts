import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { BOSS, loginAs, loginAsAli } from "./fixtures";

// موقع ثابت للاختبار (دير البلح)
const HERE = { latitude: 31.4181, longitude: 34.3507, accuracy: 12 };

test.describe("تطبيق الميدان", () => {
  test.use({ geolocation: HERE, permissions: ["geolocation"] });

  test("زيارة بدون نت بتوصل مرة وحدة لما يرجع النت، بوقت وموقع التعبئة", async ({ page, context }) => {
    await loginAsAli(page);
    await page.goto("/m/visit");
    await expect(page.getByTestId("gps")).toContainText("31.41810");

    // بدون نت
    await context.setOffline(true);
    await expect(page.getByTestId("net")).toHaveText("بدون نت");
    await page.getByRole("textbox", { name: "Line Code" }).fill("G-5555-001");
    await page.getByLabel("الفحوصات اللي تمت").fill("فحص الشبكة بدون نت");
    await page.getByRole("group", { name: "التوصية" }).getByRole("button", { name: "لا يوجد تجاوز" }).click();
    const mk = page.getByRole("group", { name: "هل عند الشركة access على المايكروتيك؟" });
    await mk.getByRole("button", { name: "لا" }).click();
    await page.getByRole("button", { name: "حفظ الزيارة" }).click();
    await expect(page.getByText("انحفظت الزيارة بالجوال")).toBeVisible();
    await expect(page.getByTestId("pending-count")).toHaveText("1");
    const filledBefore = new Date();

    // النت رجع: بتنبعت لحالها، وبتنمسح من الجوال بعد تأكيد السيرفر
    await context.setOffline(false);
    await expect(page.getByTestId("pending-count")).toHaveCount(0, { timeout: 15_000 });

    // بالموقع: زيارة وحدة بس، فيها الموقع وإجابة المايكروتيك
    await page.goto("/search?code=g5555001");
    const visits = page.getByRole("region", { name: "الزيارات" });
    await expect(visits.getByRole("heading")).toHaveText("الزيارات (1)");
    await expect(page.getByRole("region", { name: "بطاقة الخط" })).toContainText("هل عند الشركة access على المايكروتيك؟");
    await visits.locator("tbody tr").first().getByRole("link").first().click();
    await expect(page).toHaveURL(/\/visits\/[0-9a-f-]{36}$/);
    const report = page.getByRole("region", { name: "التقرير" });
    await expect(report).toContainText("31.41810, 34.35070");
    await expect(report).toContainText("وقت التعبئة بالميدان");
    expect(filledBefore.getTime()).toBeGreaterThan(0);

    // بقائمة «بحاجة access»
    await page.goto("/mikrotik/access");
    await expect(page.locator("main")).toContainText("G-5555-001");
  });

  test("نفس العنصر لو انبعت مرتين (النت قطع وقت الإرسال) ما بيتكرر", async ({ page, baseURL }) => {
    await loginAsAli(page);
    const boot = await (await page.request.get("/api/m/bootstrap")).json();
    const item = {
      uuid: randomUUID(),
      kind: "VPN",
      filledAt: new Date().toISOString(),
      payload: { networkName: "شبكة الاختبار", ip: "10.20.30.40", placeText: "دوار" },
    };
    expect(boot.me.displayName).toBeTruthy();
    const headers = { Origin: baseURL! };
    const [a, b] = await Promise.all([
      page.request.post("/api/sync", { headers, data: item }),
      page.request.post("/api/sync", { headers, data: item }),
    ]);
    expect([a.status(), b.status()].sort()).toEqual([200, 201]);
    const again = await page.request.post("/api/sync", { headers, data: item });
    expect((await again.json()).status).toBe("duplicate");

    await page.goto("/vpn?q=10.20.30.40");
    await expect(page.locator("tbody tr")).toHaveCount(1);
  });

  test("المسؤول: ما بيسجّل من الميدان ولا بيشوف كلمات سر المايكروتيك", async ({ page, baseURL }) => {
    await loginAs(page, BOSS.username, BOSS.password);
    await expect(page.getByRole("heading", { name: `أهلاً ${BOSS.name}` })).toBeVisible();
    await expect(page.getByRole("link", { name: "تطبيق الميدان" })).toHaveCount(0);
    const headers = { Origin: baseURL! };
    const sync = await page.request.post("/api/sync", {
      headers,
      data: { uuid: randomUUID(), kind: "VPN", filledAt: new Date().toISOString(), payload: { networkName: "x", ip: "1.2.3.4" } },
    });
    expect(sync.status()).toBe(403);
    const reveal = await page.request.post(`/api/mikrotik/credentials/${randomUUID()}/reveal`, {
      headers,
      data: { accountPassword: BOSS.password },
    });
    expect(reveal.status()).toBe(403);
    const save = await page.request.post("/api/mikrotik/credentials", {
      headers,
      data: { lineCode: "G-5555-001", username: "a", password: "b" },
    });
    expect(save.status()).toBe(403);
  });
});
