import { expect, type Page } from "@playwright/test";

export const ADMIN = { username: "ali", name: "علي جبر", password: "admin-pass-123" };

export async function loginAs(page: Page, username: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("اسم الدخول").fill(username);
  await page.getByLabel("كلمة السر").fill(password);
  await page.getByRole("button", { name: "دخول" }).click();
}

export async function loginAsAdmin(page: Page) {
  await loginAs(page, ADMIN.username, ADMIN.password);
  await expect(page.getByRole("heading", { name: `أهلاً ${ADMIN.name}` })).toBeVisible();
}
