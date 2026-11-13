import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import { readWorkbook, cellValue } from "@/lib/import/workbook";
import { buildLegacyFile } from "./fixtures/legacy";

describe("readWorkbook", () => {
  it("بيقرأ ملف فيه منطقة طباعة بمعادلة (متل ملف علي) بدون ما يوقع", async () => {
    // ExcelJS بيوقع على Print_Area ديناميكية متل OFFSET(...)، والملف الحقيقي فيها
    const zip = await JSZip.loadAsync(await buildLegacyFile());
    const xml = await zip.file("xl/workbook.xml")!.async("string");
    const names = `<definedNames><definedName name="_xlnm.Print_Area" localSheetId="1">OFFSET('All Visits'!$A$1,0,0,MAX(5,4+'All Visits'!$S$3),9)</definedName></definedNames>`;
    zip.file("xl/workbook.xml", xml.replace("</sheets>", `</sheets>${names}`));
    const broken = await zip.generateAsync({ type: "nodebuffer" });

    const sheets = await readWorkbook(broken);
    expect(sheets.map((s) => s.name)).toEqual(["Sheet1", "All Visits"]);
    expect(sheets[0].rows.length).toBeGreaterThan(5);
  });

  it("ملف مضغوط بيفك لحجم ضخم (zip bomb) بينرفض قبل ما ينقرأ", async () => {
    const zip = await JSZip.loadAsync(await buildLegacyFile());
    zip.file("xl/media/huge.bin", Buffer.alloc(120 * 1024 * 1024)); // أصفار بتنضغط لكم كيلو
    const bomb = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
    expect(bomb.length).toBeLessThan(2 * 1024 * 1024);
    await expect(readWorkbook(bomb)).rejects.toThrow("كبير");
  });

  it("قيم الخلايا: أخطاء الإكسل والنص الفاضي ← null", () => {
    expect(cellValue({ error: "#N/A" } as never)).toBeNull();
    expect(cellValue("  #N/A ")).toBeNull();
    expect(cellValue("   ")).toBeNull();
    expect(cellValue({ formula: "A1", result: 5 } as never)).toBe(5);
    expect(cellValue({ richText: [{ text: "مر" }, { text: "حبا" }] } as never)).toBe("مرحبا");
  });
});
