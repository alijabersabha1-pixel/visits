/**
 * تنظيف الـ Line Code، نفس فكرة تنظيف الإكسل:
 * بنشيل المسافات والشرطات بكل أنواعها والرموز المخفية، وبنحوّل لأحرف كبيرة وأرقام إنجليزية.
 * المفتاح الناتج هو اللي بنخزنه وبنبحث فيه، والكود الأصلي بينعرض متل ما انكتب.
 */

// مسافات، شرطات (- ‐ ‑ ‒ – — ―  −)، علامات اتجاه ومسافات صفرية، وأي رمز مش حرف أو رقم
const STRIP = /[^A-Za-z0-9٠-٩۰-۹]/g;

function toLatinDigits(s: string): string {
  return s
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0));
}

export function normalizeLineCode(raw: unknown): string {
  if (raw === null || raw === undefined) return "";
  return toLatinDigits(String(raw).replace(STRIP, "")).toUpperCase();
}

/** كود صالح: 4 رموز على الأقل وفيه رقم. «-» أو اسم شبكة مش كود. */
export function isValidLineCode(raw: unknown): boolean {
  const key = normalizeLineCode(raw);
  return key.length >= 4 && /\d/.test(key);
}

/** الكود الأصلي مرتّب للعرض: بدون مسافات زيادة أو أسطر */
export function displayLineCode(raw: unknown): string {
  return toLatinDigits(String(raw ?? "").trim())
    .replace(/\s+/g, "")
    .toUpperCase();
}

/**
 * مفتاح الحساب، عشان «خطوط نفس الحساب»: الكود بدون رقم الخط الأخير.
 * G-7935-001 و G-7935-003 ← G7935. وإذا الكود ناقص شرطة (G-7277002) بنفترض آخر 3 أرقام رقم الخط.
 */
export function accountKeyOf(raw: unknown): string {
  const parts = String(raw ?? "")
    .trim()
    .split(/[\s\-‐-―−]+/)
    .filter(Boolean);
  if (parts.length >= 3) return normalizeLineCode(parts.slice(0, -1).join(""));
  const key = normalizeLineCode(raw);
  const m = /^([A-Z]+\d+?)(\d{3})$/.exec(key);
  if (m && /^[A-Z]/.test(key)) return m[1];
  return key;
}

export type Region = "غزة" | "الوسطى" | "الجنوب";
export const REGIONS: readonly Region[] = ["غزة", "الوسطى", "الجنوب"];

/** كلمات بالـ Locality بتحدد المنطقة. الترتيب مهم: «شمال غزة» قبل أي شي. */
const REGION_WORDS: Array<[RegExp, Region]> = [
  [/غزة|جباليا|بيت لاهيا|بيت حانون|الشاطئ|الرمال|الشجاعية|تل الهوى/, "غزة"],
  [/الوسط[ىي]|دير البلح|النصيرات|الزوايدة|المغازي|البريج|المصدر/, "الوسطى"],
  [/خان ?يونس|رفح|القرارة|بني سهيلا|عبسان|خزاعة|المواصي/, "الجنوب"],
];

/** المنطقة من خانة Locality. مكان مش معروف ← null، وبيطلع بمعاينة الاستيراد عشان ينضاف. */
export function regionOf(locality: unknown): Region | null {
  const text = String(locality ?? "").trim();
  if (!text) return null;
  for (const [re, region] of REGION_WORDS) if (re.test(text)) return region;
  return null;
}
