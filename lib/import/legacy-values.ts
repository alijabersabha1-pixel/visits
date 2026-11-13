/**
 * توحيد قيم التوصية والإجراء بالإكسل القديم مع القوائم.
 * المقارنة بعد توحيد الإملاء (همزات، تاء مربوطة، مسافات، تنوين)، وبعض الصيغ اللي معناها نفس القيمة.
 * القيمة اللي ما إلها مقابل بتنضاف للقائمة كقيمة موقوفة، فبتضل ظاهرة بالزيارة القديمة.
 */
import type { ListKind } from "../lists";

export function normArabic(s: string): string {
  return s
    .replace(/[ً-ْـ]/g, "") // تشكيل وتنوين وتطويل
    .replace(/[أإآ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .replace(/[\s+،,._\-]+/g, "")
    .trim();
}

/** صيغ بتختلف بأكتر من الإملاء، والقيمة المقصودة فيها */
const ALIASES: Record<ListKind, Record<string, string>> = {
  RECOMMENDATION: {
    "زيارات غير ناجحة": "زيارة غير ناجحة",
    "اعاده الزياره": "إعادة زيارة",
    "إعادة الزيارة": "إعادة زيارة",
    "فحص شبكات": "فحص شبكة",
  },
  ACTION: {
    "تم تجميد خدمه": "تم تجميد الخدمة",
  },
};

export function matchListValue(kind: ListKind, raw: unknown, labels: readonly string[]): string | null {
  const text = String(raw ?? "").trim();
  if (!text || text === "None") return null;
  const byNorm = new Map(labels.map((l) => [normArabic(l), l]));
  const direct = byNorm.get(normArabic(text));
  if (direct) return direct;
  for (const [alias, target] of Object.entries(ALIASES[kind])) {
    if (normArabic(alias) === normArabic(text)) return byNorm.get(normArabic(target)) ?? null;
  }
  return null;
}
