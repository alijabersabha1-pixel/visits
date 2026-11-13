/**
 * CSV بيفتح صح بالإكسل: BOM للعربي، واقتباس الفواصل والأسطر.
 * الخلية اللي بتبلش بـ = + - @ بتاخد ' قبلها، عشان الإكسل ما يشغلها كمعادلة (CSV injection).
 */
export function csv(rows: ReadonlyArray<ReadonlyArray<string | number | null | undefined>>): string {
  const cell = (v: string | number | null | undefined) => {
    let s = String(v ?? "");
    if (typeof v === "string" && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return "\uFEFF" + rows.map((r) => r.map(cell).join(",")).join("\n") + "\n";
}
