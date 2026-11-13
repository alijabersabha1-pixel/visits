import { expect, type Page } from "@playwright/test";

/** السفير: بيعمل كل شي */
export const ALI = { username: "ali", name: "علي جبر", password: "ali-pass-123" };
/** المسؤول: بيشوف للقراءة بس */
export const BOSS = { username: "boss", name: "المسؤول", password: "boss-pass-123" };

export async function loginAs(page: Page, username: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("اسم الدخول").fill(username);
  await page.getByLabel("كلمة السر").fill(password);
  await page.getByRole("button", { name: "دخول" }).click();
}

export async function loginAsAli(page: Page) {
  await loginAs(page, ALI.username, ALI.password);
  await expect(page.getByRole("heading", { name: `أهلاً ${ALI.name}` })).toBeVisible();
}

export async function loginAsBoss(page: Page) {
  await loginAs(page, BOSS.username, BOSS.password);
  await expect(page.getByRole("heading", { name: `أهلاً ${BOSS.name}` })).toBeVisible();
}
