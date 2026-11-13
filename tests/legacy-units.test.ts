import { describe, expect, it } from "vitest";
import { flagOutOfOrder, parseLegacyDate } from "@/lib/import/legacy-dates";
import { matchListValue, normArabic } from "@/lib/import/legacy-values";

const iso = (d: Date | null) => d?.toISOString().slice(0, 10) ?? null;

describe("تواريخ الإكسل القديم", () => {
  it("النص شهر/يوم متل ما هو", () => {
    expect(parseLegacyDate("4/20/2026")).toMatchObject({ method: "text", doubtful: false });
    expect(iso(parseLegacyDate("4/20/2026").date)).toBe("2026-04-20");
    expect(iso(parseLegacyDate("10/29/2026").date)).toBe("2026-10-29");
  });

  it("خلية التاريخ اللي قلبها الإكسل بتنقلب (5 نوفمبر ← 11 مايو)", () => {
    const r = parseLegacyDate(new Date(Date.UTC(2026, 10, 5)));
    expect(r.method).toBe("swapped");
    expect(iso(r.date)).toBe("2026-05-11");
    // يوم وشهر نفس الرقم: ما بتفرق
    expect(iso(parseLegacyDate(new Date(Date.UTC(2026, 8, 9))).date)).toBe("2026-09-09");
  });

  it("خلية يومها أكبر من 12 ما بتنقلب وبتطلع بالمراجعة", () => {
    const r = parseLegacyDate(new Date(Date.UTC(2026, 4, 20)));
    expect(r).toMatchObject({ method: "unswappable", doubtful: true });
    expect(iso(r.date)).toBe("2026-05-20");
  });

  it("نص مش مفهوم أو فاضي", () => {
    expect(parseLegacyDate("13/40/2026")).toMatchObject({ date: null, doubtful: true });
    expect(parseLegacyDate("بكرا")).toMatchObject({ date: null, doubtful: true });
    expect(parseLegacyDate(null)).toMatchObject({ date: null, doubtful: true });
  });

  it("تاريخ خارج ترتيب الصفوف بأكتر من 3 أيام بيتعلّم، أو بالمستقبل", () => {
    const d = (s: string) => new Date(`${s}T00:00:00Z`);
    const dates = [
      d("2026-05-01"),
      d("2026-05-03"),
      d("2026-04-20"),
      d("2026-05-02"),
      d("2026-05-04"),
      d("2027-01-01"),
    ];
    expect(flagOutOfOrder(dates, d("2026-11-13"))).toEqual([false, false, true, false, false, true]);
    expect(flagOutOfOrder([null, d("2026-05-01")], d("2026-11-13"))).toEqual([false, false]);
  });
});

describe("توحيد قيم التوصية والإجراء", () => {
  const recs = [
    "يوجد تجاوز",
    "لا يوجد تجاوز",
    "إعادة زيارة",
    "زيارة غير ناجحة",
    "فحص شبكة",
    "مفصول سابقاً بسبب التجاوز",
  ];
  const actions = [
    "تم تصويب الوضع",
    "تم تجميد الخدمة",
    "جاري تجميد الخدمة",
    "فصل الخدمة نهائياً",
    "تحذير + تعهد عدلي",
    "لا يوجد تجاوز بمعرفة مدير الحساب",
    "إعادة زيارة للتأكد",
    "إعادة خدمة",
  ];

  it("توحيد النص العربي", () => {
    expect(normArabic("زيارة غير ناجحه")).toBe(normArabic("زيارة غير ناجحة"));
    expect(normArabic("فصل الخدمه نهائيا")).toBe(normArabic("فصل الخدمة نهائياً"));
    expect(normArabic("تحذير+تعهد عدلي")).toBe(normArabic("تحذير + تعهد عدلي"));
  });

  it.each([
    ["زيارة غير ناجحه", "زيارة غير ناجحة"],
    ["زيارات غير ناجحة", "زيارة غير ناجحة"],
    ["اعاده الزياره", "إعادة زيارة"],
    ["إعادة الزيارة", "إعادة زيارة"],
    ["فحص شبكات", "فحص شبكة"],
    ["مفصول سابقا بسبب التجاوز", "مفصول سابقاً بسبب التجاوز"],
    ["يوجد تجاوز ", "يوجد تجاوز"],
  ])("توصية %j ← %s", (raw, label) => {
    expect(matchListValue("RECOMMENDATION", raw, recs)).toBe(label);
  });

  it.each([
    ["تم تجميد خدمه", "تم تجميد الخدمة"],
    ["لايوجد تجاوز بمعرفه مدير الحساب", "لا يوجد تجاوز بمعرفة مدير الحساب"],
    ["جاري تجميد الخدمه", "جاري تجميد الخدمة"],
    ["إعادة زيارة للتاكد", "إعادة زيارة للتأكد"],
    ["فصل الخدمه نهائيا", "فصل الخدمة نهائياً"],
    ["تحذير+تعهد عدلي", "تحذير + تعهد عدلي"],
    ["اعاده خدمه", "إعادة خدمة"],
  ])("إجراء %j ← %s", (raw, label) => {
    expect(matchListValue("ACTION", raw, actions)).toBe(label);
  });

  it("قيمة مش معروفة ← null (بتنضاف كقيمة موقوفة وبتطلع بالتقرير)", () => {
    expect(matchListValue("ACTION", "تم اعاده زيارة", actions)).toBeNull();
    expect(matchListValue("ACTION", null, actions)).toBeNull();
  });
});
