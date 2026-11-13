/** التواريخ بتوقيت فلسطين. التاريخ بيتخزن كتاريخ بدون وقت (UTC منتصف الليل). */

export const TIME_ZONE = "Asia/Hebron";

/** تاريخ اليوم بتوقيت فلسطين: 2026-11-13 */
export function todayLocal(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/** «2026-11-13» ← Date بمنتصف الليل UTC، أو null إذا مش تاريخ صحيح */
export function parseDay(s: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return null;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return d.getUTCMonth() === Number(m[2]) - 1 && d.getUTCDate() === Number(m[3]) ? d : null;
}

export function formatDay(d: Date | null | undefined): string {
  return d ? d.toISOString().slice(0, 10) : "";
}
