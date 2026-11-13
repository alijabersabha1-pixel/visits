/**
 * PDF من صفحات /print عن طريق Chromium على السيرفر، عشان العربي من اليمين لليسار يطلع صح.
 * على Docker: CHROME_PATH=/usr/bin/chromium (منصّب بالصورة). بالتطوير: كروم الجهاز أو متصفح Playwright.
 */
import "server-only";
import { chromium, type Browser } from "playwright-core";
import { SESSION_COOKIE } from "../auth";

let browser: Promise<Browser> | null = null;

function getBrowser(): Promise<Browser> {
  browser ??= chromium
    .launch({
      executablePath: process.env.CHROME_PATH || undefined,
      args: ["--no-sandbox", "--disable-dev-shm-usage", "--font-render-hinting=none"],
    })
    .catch((err) => {
      browser = null;
      throw err;
    });
  return browser;
}

/** عنوان السيرفر نفسه من جوّا (ما بيطلع برّا الجهاز) */
export function internalBase(): string {
  return process.env.PDF_BASE_URL || `http://127.0.0.1:${process.env.PORT || 3000}`;
}

/** بيفتح صفحة الطباعة بجلسة المستخدم نفسه، فالصلاحيات نفسها بتنطبق */
export async function renderPdf(path: string, sessionToken: string): Promise<Buffer> {
  const base = new URL(internalBase());
  const b = await getBrowser();
  const ctx = await b.newContext({ locale: "ar", timezoneId: "Asia/Hebron" });
  try {
    await ctx.addCookies([{ name: SESSION_COOKIE, value: sessionToken, domain: base.hostname, path: "/", httpOnly: true }]);
    const page = await ctx.newPage();
    const res = await page.goto(new URL(path, base).toString(), { waitUntil: "networkidle", timeout: 60_000 });
    if (!res || !res.ok() || new URL(page.url()).pathname === "/login") throw new Error(`print page failed: ${res?.status()}`);
    await page.evaluate(() => document.fonts.ready);
    return await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "14mm", bottom: "16mm", left: "12mm", right: "12mm" },
      displayHeaderFooter: true,
      headerTemplate: "<span></span>",
      footerTemplate:
        '<div style="width:100%;font-size:8px;color:#7a8693;text-align:center;font-family:sans-serif"><span class="pageNumber"></span> / <span class="totalPages"></span></div>',
    });
  } finally {
    await ctx.close();
  }
}
