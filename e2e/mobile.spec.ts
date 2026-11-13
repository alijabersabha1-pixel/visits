import { test, expect } from "@playwright/test";
import { loginAsAli } from "./fixtures";

test("على شاشة 360px: القائمة بتنفتح وما في تمرير أفقي", async ({ page }) => {
  await loginAsAli(page);
  for (const path of ["/", "/admin/users", "/admin/audit"]) {
    await page.goto(path);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, `horizontal overflow on ${path}`).toBeLessThanOrEqual(0);
  }
  await page.goto("/");
  await expect(page.locator(".sidebar")).toBeHidden();
  await page.locator(".topbar summary").click();
  await page.locator(".topbar").getByRole("link", { name: "المستخدمون" }).click();
  await expect(page).toHaveURL(/\/admin\/users$/);
});
