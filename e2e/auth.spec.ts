import { test, expect } from "@playwright/test";
import { ALI, loginAs, loginAsAli } from "./fixtures";

test("بدون دخول: أي صفحة بتحوّل لصفحة الدخول", async ({ page }) => {
  for (const path of ["/", "/admin/users", "/admin/audit", "/account/password"]) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/login$/);
  }
  await expect(page.getByRole("heading", { name: "تسجيل الدخول" })).toBeVisible();
  expect(await page.locator("html").getAttribute("dir")).toBe("rtl");
});

test("بدون جلسة: الطلب المباشر للسيرفر بيرجع 401", async ({ request, baseURL }) => {
  expect((await request.get("/api/me")).status()).toBe(401);
  expect((await request.get("/api/users")).status()).toBe(401);
  const post = await request.post("/api/users", {
    headers: { Origin: baseURL! },
    data: { username: "x1x", displayName: "x", role: "AMBASSADOR" },
  });
  expect(post.status()).toBe(401);
  // كوكي مزيّفة كمان 401
  const fake = await request.get("/api/me", { headers: { Cookie: "av_session=forged" } });
  expect(fake.status()).toBe(401);
});

test("طلب من موقع تاني بينرفض (CSRF)", async ({ request }) => {
  const res = await request.post("/api/auth/login", {
    headers: { Origin: "https://evil.example" },
    data: { username: ALI.username, password: ALI.password },
  });
  expect(res.status()).toBe(403);
});

test("دخول غلط، ثم دخول صحيح، ثم خروج", async ({ page }) => {
  await loginAs(page, ALI.username, "wrong-password");
  await expect(page.locator(".alert-error")).toContainText("اسم الدخول أو كلمة السر غلط");

  await loginAsAli(page);
  await expect(page.getByRole("link", { name: "المستخدمون" }).first()).toBeVisible();

  await page.locator(".sidebar").getByRole("button", { name: "خروج" }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.goto("/");
  await expect(page).toHaveURL(/\/login$/);
});

test("5 محاولات غلط بتقفل الحساب", async ({ request, baseURL }) => {
  // حساب منفصل عشان ما نقفل علي على باقي الاختبارات
  const ctx = await loginApi(request, baseURL!);
  const create = await request.post("/api/users", {
    headers: { Origin: baseURL!, Cookie: ctx },
    data: { username: "lock.me", displayName: "للقفل", role: "AMBASSADOR" },
  });
  expect(create.status()).toBe(201);
  const { tempPassword } = await create.json();

  for (let i = 0; i < 4; i++) {
    const r = await request.post("/api/auth/login", {
      headers: { Origin: baseURL! },
      data: { username: "lock.me", password: "nope-nope" },
    });
    expect(r.status()).toBe(401);
  }
  const fifth = await request.post("/api/auth/login", {
    headers: { Origin: baseURL! },
    data: { username: "lock.me", password: "nope-nope" },
  });
  expect(fifth.status()).toBe(423);
  expect((await fifth.json()).error).toContain("15 دقيقة");
  const right = await request.post("/api/auth/login", {
    headers: { Origin: baseURL! },
    data: { username: "lock.me", password: tempPassword },
  });
  expect(right.status()).toBe(423);
});

async function loginApi(request: import("@playwright/test").APIRequestContext, baseURL: string) {
  const res = await request.post("/api/auth/login", {
    headers: { Origin: baseURL },
    data: { username: ALI.username, password: ALI.password },
  });
  expect(res.ok()).toBeTruthy();
  const cookie = res.headers()["set-cookie"]!.split(";")[0];
  return cookie;
}
