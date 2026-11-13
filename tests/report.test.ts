import { describe, expect, it } from "vitest";
import { csv } from "@/lib/csv";

describe("CSV للإكسل", () => {
  it("BOM للعربي، واقتباس الفواصل والأسطر", () => {
    expect(
      csv([
        ["أ", "ب,ج"],
        ['قال "مرحبا"', "سطر\nتاني"],
      ]),
    ).toBe('﻿أ,"ب,ج"\n"قال ""مرحبا""","سطر\nتاني"\n');
  });
  it("خلية بتبلش بـ = + - @ ما بتشتغل كمعادلة بالإكسل", () => {
    expect(csv([['=HYPERLINK("http://x")', "+1", "-", "@SUM(A1)", 5]])).toBe(
      '\uFEFF"\'=HYPERLINK(""http://x"")",\'+1,\'-,\'@SUM(A1),5\n',
    );
  });
});
