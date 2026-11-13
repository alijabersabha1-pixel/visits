import { describe, expect, it } from "vitest";
import { accountKeyOf, isValidLineCode, normalizeLineCode, regionOf } from "@/lib/line-code";

describe("normalizeLineCode", () => {
  // كل الأشكال اللي طلعت بالإكسل وبملفات الشهر الحقيقية
  it.each([
    ["G-7872-002", "G7872002"],
    ["g 7872 002", "G7872002"],
    ["G‑7872‑002", "G7872002"], // non-breaking hyphen
    ["G–7872—002", "G7872002"], // en/em dash
    ["G-7872-002\n", "G7872002"],
    ["G-7872-002 ", "G7872002"],
    ["‏G-7872-002‎", "G7872002"], // علامات اتجاه مخفية من نسخ عربي
    ["G-7277002", "G7277002"],
    ["N136-009", "N136009"],
    ["BCI-N-66-01", "BCIN6601"],
    ["G-٧٨٧٢-٠٠٢", "G7872002"], // أرقام عربية
    ["  b-12-020  ", "B12020"],
  ])("%j → %s", (input, key) => {
    expect(normalizeLineCode(input)).toBe(key);
  });

  it("قيم فاضية", () => {
    expect(normalizeLineCode(null)).toBe("");
    expect(normalizeLineCode(undefined)).toBe("");
    expect(normalizeLineCode("-")).toBe("");
  });

  it("أرقام من الإكسل كرقم مش نص", () => {
    expect(normalizeLineCode(97082659156)).toBe("97082659156");
  });
});

describe("isValidLineCode", () => {
  it.each(["G-7872-002", "B-12-020", "BCI-N-66-01", "N136-009", "97082659156"])("%s صالح", (c) => {
    expect(isValidLineCode(c)).toBe(true);
  });
  it.each(["-", "", "  ", "شبكة الهدى", "G", "ABC"])("%j مش صالح", (c) => {
    expect(isValidLineCode(c)).toBe(false);
  });
});

describe("accountKeyOf (خطوط نفس الحساب)", () => {
  it("بيشيل رقم الخط الأخير", () => {
    expect(accountKeyOf("G-7935-001")).toBe("G7935");
    expect(accountKeyOf("G-7935-003")).toBe("G7935");
    expect(accountKeyOf("G-11124-001")).toBe("G11124");
    expect(accountKeyOf("BCI-N-66-01")).toBe("BCIN66");
  });
  it("آخر جزء أقل من 3 أرقام", () => {
    expect(accountKeyOf("G-123-01")).toBe("G123");
  });
  it("الكود الناقص شرطة بيعطي نفس الحساب", () => {
    expect(accountKeyOf("G-7277002")).toBe(accountKeyOf("G-7277-002"));
    expect(accountKeyOf("G7277002")).toBe("G7277");
  });
  it("كود مش مفهوم بيضل هو نفسه", () => {
    expect(accountKeyOf("97082659156")).toBe("97082659156");
  });
});

describe("regionOf (المنطقة من Locality)", () => {
  it.each([
    ["غزة", "غزة"],
    ["شمال غزة - جباليا", "غزة"],
    ["مدينة غزة", "غزة"],
    ["الوسطى", "الوسطى"],
    ["الوسطي", "الوسطى"],
    ["دير البلح", "الوسطى"],
    ["البلد - دير البلح", "الوسطى"],
    ["مخيم دير البلح", "الوسطى"],
    ["النصيرات", "الوسطى"],
    ["الزوايدة", "الوسطى"],
    ["مخيم المغازي", "الوسطى"],
    ["خانيونس", "الجنوب"],
    ["خان يونس", "الجنوب"],
    ["رفح", "الجنوب"],
  ])("%s → %s", (loc, region) => {
    expect(regionOf(loc)).toBe(region);
  });
  it("مكان مش معروف ← null (بيطلع بالمعاينة)", () => {
    expect(regionOf("حي البركة")).toBeNull();
    expect(regionOf(null)).toBeNull();
    expect(regionOf("")).toBeNull();
  });
});
