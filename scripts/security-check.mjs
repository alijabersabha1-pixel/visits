/**
 * فحص أمان سريع على نسخة شغالة (بديل خفيف لـ OWASP ZAP لما ما يكون متاح، ومكمّل إله):
 *   node scripts/security-check.mjs http://127.0.0.1:3000
 * بيفحص: رؤوس الأمان، الكوكي، إنه كل الـ API بترفض بدون جلسة، CSRF، رسائل الخطأ، تحديد المعدل.
 * بيطلع 1 إذا في أي نتيجة عالية أو متوسطة.
 */
import { readdirSync, statSync } from "node:fs";
import path from "node:path";

const base = (process.argv[2] || "http://127.0.0.1:3000").replace(/\/$/, "");
const results = [];
const add = (sev, check, ok, note = "") => results.push({ sev, check, ok, note });

function apiRoutes(dir = "app/api", prefix = "/api") {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) {
      const seg = name.startsWith("[") ? "00000000-0000-4000-8000-000000000000" : name;
      out.push(...apiRoutes(p, `${prefix}/${seg}`));
    } else if (name === "route.ts") out.push(prefix);
  }
  return out;
}

// 1) رؤوس الأمان على صفحة
const page = await fetch(`${base}/login`, { redirect: "manual" });
const h = page.headers;
const csp = h.get("content-security-policy") ?? "";
add("medium", "Content-Security-Policy موجود", !!csp);
add("medium", "CSP: default-src 'self'", csp.includes("default-src 'self'"));
add("medium", "CSP: frame-ancestors 'none'", csp.includes("frame-ancestors 'none'"));
add("low", "CSP بدون unsafe-eval (إنتاج)", !csp.includes("unsafe-eval"));
add("info", "CSP فيه unsafe-inline للسكربتات (مقبول: صفحات الجوال ثابتة للأوفلاين)", true, csp.includes("'unsafe-inline'") ? "موجود" : "مش موجود");
add("medium", "X-Frame-Options: DENY", h.get("x-frame-options") === "DENY");
add("low", "X-Content-Type-Options: nosniff", h.get("x-content-type-options") === "nosniff");
add("low", "Referrer-Policy", !!h.get("referrer-policy"));
add("low", "بدون X-Powered-By", !h.get("x-powered-by"));
if (base.startsWith("https://")) add("medium", "Strict-Transport-Security", !!h.get("strict-transport-security"));

// 2) كل الـ API بدون جلسة
const routes = apiRoutes();
const open = [];
for (const r of routes) {
  if (r.startsWith("/api/auth/")) continue;
  for (const method of ["GET", "POST"]) {
    const res = await fetch(base + r, {
      method,
      headers: { Origin: base, "Content-Type": "application/json" },
      body: method === "POST" ? "{}" : undefined,
      redirect: "manual",
    });
    if (![401, 404, 405].includes(res.status)) open.push(`${method} ${r} → ${res.status}`);
  }
}
add("high", `كل الـ API (${routes.length}) بترفض بدون جلسة`, open.length === 0, open.join("، "));

// 3) CSRF: طلب من موقع تاني
const csrf = await fetch(`${base}/api/auth/login`, {
  method: "POST",
  headers: { Origin: "https://evil.example", "Content-Type": "application/json" },
  body: JSON.stringify({ username: "x", password: "y" }),
});
add("high", "طلب من مصدر غريب بينرفض (CSRF)", csrf.status === 403);

// 4) رسائل الخطأ ما بتكشف تفاصيل
const bad = await fetch(`${base}/api/auth/login`, {
  method: "POST",
  headers: { Origin: base, "Content-Type": "application/json" },
  body: "{not json",
});
const badText = await bad.text();
add("medium", "الخطأ ما بيكشف stack trace", !/at\s+\w+\s*\(|node_modules|Error:/.test(badText), badText.slice(0, 80));

// 5) الكوكي (لو في حساب تجربة)
if (process.env.CHECK_USER && process.env.CHECK_PASS) {
  const login = await fetch(`${base}/api/auth/login`, {
    method: "POST",
    headers: { Origin: base, "Content-Type": "application/json" },
    body: JSON.stringify({ username: process.env.CHECK_USER, password: process.env.CHECK_PASS }),
  });
  const cookie = login.headers.get("set-cookie") ?? "";
  add("high", "كوكي الجلسة HttpOnly", /httponly/i.test(cookie));
  add("medium", "كوكي الجلسة SameSite", /samesite=(lax|strict)/i.test(cookie));
  if (base.startsWith("https://")) add("high", "كوكي الجلسة Secure", /;\s*secure/i.test(cookie));
}

// 6) تحديد معدل الدخول
let limited = false;
for (let i = 0; i < 12 && !limited; i++) {
  const r = await fetch(`${base}/api/auth/login`, {
    method: "POST",
    headers: { Origin: base, "Content-Type": "application/json" },
    body: JSON.stringify({ username: "rate-limit-probe", password: "wrong-password" }),
  });
  limited = r.status === 429;
}
add("medium", "محاولات الدخول الكتيرة بتنوقف (429)", limited);

// 7) ملفات حساسة مش منشورة
for (const p of ["/.env", "/.git/config", "/prisma/schema.prisma", "/package.json"]) {
  const r = await fetch(base + p, { redirect: "manual" });
  const t = r.status === 200 ? await r.text() : "";
  add("high", `${p} مش منشور`, !(r.status === 200 && /DATABASE_URL|\[core\]|datasource|"dependencies"/.test(t)));
}

const fail = results.filter((r) => !r.ok && (r.sev === "high" || r.sev === "medium"));
for (const r of results) console.log(`${r.ok ? "✓" : "✗"} [${r.sev}] ${r.check}${r.note ? ` — ${r.note}` : ""}`);
console.log(`\n${results.filter((r) => r.ok).length}/${results.length} نجحت · ${fail.length} عالية/متوسطة مفتوحة`);
process.exit(fail.length ? 1 : 0);
