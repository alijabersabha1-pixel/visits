import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { loginAsAli, loginAsBoss } from "./fixtures";

test("زيارة فيها موقع بتطلع دبوس على الخريطة، والنقر بيفتح تفاصيل الخط", async ({ page, baseURL, browser }) => {
  await loginAsAli(page);
  const boot = await (await page.request.get("/api/m/bootstrap")).json();
  const violation = boot.recommendations.find((r: { label: string }) => r.label === "يوجد تجاوز").id;
  const send = (code: string, gps: { lat: number; lng: number } | null) =>
    page.request.post("/api/sync", {
      headers: { Origin: baseURL! },
      data: {
        uuid: randomUUID(),
        kind: "VISIT",
        filledAt: new Date().toISOString(),
        payload: {
          lineCode: code,
          specialCase: false,
          accountName: "محل الخريطة",
          recommendationId: violation,
          companionIds: [],
          photos: [],
          mikrotik: [],
          gps: gps && { ...gps, accuracy: 15 },
        },
      },
    });
  expect((await send("G-7777-001", { lat: 31.5017, lng: 34.4668 })).status()).toBe(201);
  expect((await send("G-7777-002", null)).status()).toBe(201);

  // المسؤول بيشوف الخريطة كمان
  const ctx = await browser.newContext();
  const boss = await ctx.newPage();
  await loginAsBoss(boss);
  await boss.goto("/map");
  await expect(boss.getByTestId("pin-count")).not.toHaveText("0");
  const noLoc = Number(await boss.getByTestId("no-location").innerText());
  expect(noLoc).toBeGreaterThanOrEqual(1);
  await boss.getByRole("button", { name: "G-7777-001" }).click({ timeout: 10_000 }).catch(async () => {
    // الدبوس جوّا تجمّع: كبّر لحد ما يبين
    await boss.locator(".marker-cluster").first().click();
    await boss.getByRole("button", { name: "G-7777-001" }).click();
  });
  const panel = boss.getByRole("complementary", { name: "تفاصيل الخط" });
  await expect(panel).toContainText("G-7777-001");
  await expect(panel).toContainText("يوجد تجاوز");
  await expect(panel.getByRole("link", { name: "كل تاريخ الخط" })).toBeVisible();

  // فلتر التوصية بيخفي الدبوس
  const fine = boot.recommendations.find((r: { label: string }) => r.label === "لا يوجد تجاوز").id;
  const filtered = await (await boss.request.get(`/api/map?rec=${fine}`)).json();
  expect(filtered.pins.map((p: { code: string }) => p.code)).not.toContain("G-7777-001");
  const all = await (await boss.request.get(`/api/map?rec=${violation}`)).json();
  expect(all.pins.map((p: { code: string }) => p.code)).toContain("G-7777-001");
  await ctx.close();
});
