import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.E2E_PORT ?? 3100);
const baseURL = `http://127.0.0.1:${PORT}`;
export const E2E_DATABASE_URL =
  process.env.E2E_DATABASE_URL ?? "postgresql://visits:visits@localhost:5432/visits_e2e_test";

// بالبيئات اللي ما بتقدر تنزّل متصفح Playwright، ممكن نستعمل كروم موجود: CHROME_PATH=/usr/bin/google-chrome
const executablePath = process.env.CHROME_PATH || undefined;

export default defineConfig({
  testDir: "e2e",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"]],
  globalSetup: "./e2e/global-setup.ts",
  use: {
    baseURL,
    locale: "ar",
    timezoneId: "Asia/Hebron",
    trace: "retain-on-failure",
    launchOptions: { executablePath },
  },
  projects: [
    {
      name: "desktop",
      use: { ...devices["Desktop Chrome"], launchOptions: { executablePath } },
      testIgnore: /mobile\.spec\.ts/,
    },
    {
      name: "mobile",
      use: { ...devices["Pixel 5"], viewport: { width: 360, height: 760 }, launchOptions: { executablePath } },
      testMatch: /mobile\.spec\.ts/,
    },
  ],
  webServer: {
    // البناء لازم يكون جاهز (npm run build). بنشغّل نفس السيرفر المستقل اللي بيروح على Docker.
    command: "node scripts/start-standalone.mjs",
    url: `${baseURL}/login`,
    reuseExistingServer: false,
    timeout: 60_000,
    env: {
      // E2E_APP_DATABASE_URL: تشغيل الموقع بمستخدم قاعدة بيانات أقل صلاحيات (متل الإنتاج)
      DATABASE_URL: process.env.E2E_APP_DATABASE_URL || E2E_DATABASE_URL,
      APP_ORIGIN: baseURL,
      PORT: String(PORT),
      HOSTNAME: "127.0.0.1",
      COOKIE_SECURE: "false",
    },
  },
});
