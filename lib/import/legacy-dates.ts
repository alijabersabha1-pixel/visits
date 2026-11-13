/**
 * تواريخ ملف الزيارات القديم. القاعدة طلعت من مقارنة كل الـ 949 زيارة مع عمود «التاريخ (مصحّح)» بورقة «بيانات»:
 *  - التاريخ المكتوب كنص «4/20/2026» = شهر/يوم/سنة، صحيح متل ما هو (597 زيارة)
 *  - التاريخ المحفوظ كخلية تاريخ قلبه الإكسل (اعتبر الشهر يوم)، فبنرجّع نبدّل اليوم والشهر (352 زيارة، كلها بدون استثناء)
 */

export type LegacyDateMethod = "text" | "swapped" | "unswappable" | "invalid";

export interface LegacyDate {
  date: Date | null;
  method: LegacyDateMethod;
  doubtful: boolean;
  reason?: string;
}

function utc(y: number, m: number, d: number): Date | null {
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d ? date : null;
}

export function parseLegacyDate(raw: unknown): LegacyDate {
  if (raw instanceof Date && !Number.isNaN(raw.getTime())) {
    const y = raw.getUTCFullYear();
    const shownMonth = raw.getUTCMonth() + 1;
    const shownDay = raw.getUTCDate();
    if (shownDay > 12) {
      return {
        date: utc(y, shownMonth, shownDay),
        method: "unswappable",
        doubtful: true,
        reason: "خلية تاريخ يومها أكبر من 12، فما بتنقلب. تأكد منها",
      };
    }
    return { date: utc(y, shownDay, shownMonth), method: "swapped", doubtful: false };
  }
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(String(raw ?? "").trim());
  if (m) {
    const date = utc(Number(m[3]), Number(m[1]), Number(m[2]));
    if (date) return { date, method: "text", doubtful: false };
  }
  return { date: null, method: "invalid", doubtful: true, reason: `تاريخ مش مفهوم: ${String(raw ?? "فاضي")}` };
}

const DAY = 24 * 60 * 60_000;

/**
 * الصفوف بالإكسل مرتبة حسب التاريخ. تاريخ أقدم من أكبر تاريخ قبله بأكتر من 3 أيام،
 * أو تاريخ بالمستقبل، غالباً غلط فبيطلع بقائمة المراجعة.
 */
export function flagOutOfOrder(dates: Array<Date | null>, today: Date, toleranceDays = 3): boolean[] {
  let max: number | null = null;
  return dates.map((d) => {
    if (!d) return false;
    const t = d.getTime();
    const flagged = t > today.getTime() || (max !== null && max - t > toleranceDays * DAY);
    if (!flagged) max = max === null ? t : Math.max(max, t);
    return flagged;
  });
}
