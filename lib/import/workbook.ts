/**
 * قراءة ملف إكسل لجداول بسيطة: لكل ورقة اسمها، عناوين أعمدتها، وصفوفها برقم الصف الحقيقي.
 */
import ExcelJS from "exceljs";
import JSZip from "jszip";
import { ApiError } from "../errors";

export type Cell = string | number | boolean | Date | null;

export interface SheetRow {
  rowNumber: number; // رقم الصف متل ما بيظهر بالإكسل
  cells: Record<string, Cell>;
}

export interface Sheet {
  name: string;
  headers: string[];
  rows: SheetRow[];
}

/** قيمة خلية ExcelJS ← قيمة بسيطة. أخطاء متل #N/A والفاضي ← null */
export function cellValue(v: ExcelJS.CellValue | undefined): Cell {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return v;
  if (typeof v === "string") {
    const t = v.trim();
    return t === "" || /^#(N\/A|REF!|VALUE!|DIV\/0!|NAME\?)$/i.test(t) ? null : t;
  }
  if (typeof v === "number" || typeof v === "boolean") return v;
  if (typeof v === "object") {
    if ("error" in v) return null;
    if ("result" in v) return cellValue(v.result as ExcelJS.CellValue);
    if ("richText" in v) return cellValue(v.richText.map((r) => r.text).join(""));
    if ("text" in v) return cellValue((v as { text: string }).text);
  }
  return null;
}

/**
 * ExcelJS بيوقع على «الأسماء المعرّفة» الديناميكية (متل منطقة طباعة بمعادلة OFFSET، وهي موجودة بملف علي).
 * إحنا بس بنقرأ البيانات، فبنشيل الأسماء المعرّفة قبل القراءة.
 */
/** أكبر حجم بعد فك الضغط. ملف شهر حقيقي ~1 ميغا؛ الحد بيمنع ملف صغير بيفك لغيغات (zip bomb). */
export const MAX_UNZIPPED_BYTES = 100 * 1024 * 1024;

async function withoutDefinedNames(buffer: Buffer | ArrayBuffer): Promise<Buffer> {
  const zip = await JSZip.loadAsync(buffer);
  // الحجم المعلن بكل ملف جوّا الـ zip، قبل ما نفك أي شي
  let total = 0;
  zip.forEach((_path, file) => {
    total += (file as unknown as { _data?: { uncompressedSize?: number } })._data?.uncompressedSize ?? 0;
  });
  if (total > MAX_UNZIPPED_BYTES) throw new ApiError(413, "الملف كبير كتير بعد فك الضغط");
  const entry = zip.file("xl/workbook.xml");
  if (entry) {
    const xml = await entry.async("string");
    zip.file("xl/workbook.xml", xml.replace(/<definedNames>[\s\S]*?<\/definedNames>|<definedNames\/>/g, ""));
  }
  return zip.generateAsync({ type: "nodebuffer" });
}

export async function readWorkbook(buffer: Buffer | ArrayBuffer): Promise<Sheet[]> {
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load((await withoutDefinedNames(buffer)) as unknown as ArrayBuffer);
  } catch (err) {
    if (err instanceof ApiError) throw err;
    throw new ApiError(400, "الملف مش ملف إكسل (xlsx) أو تالف");
  }
  return wb.worksheets.map((ws) => {
    const headerRow = ws.getRow(1);
    const headers: string[] = [];
    const byColumn = new Map<number, string>();
    headerRow.eachCell({ includeEmpty: false }, (cell, col) => {
      const h = cellValue(cell.value);
      if (h === null) return;
      let name = String(h).replace(/\s+/g, " ").trim();
      // عمودين بنفس الاسم: التاني بياخد رقم
      while (headers.includes(name)) name = `${name} (${col})`;
      headers.push(name);
      byColumn.set(col, name);
    });
    const rows: SheetRow[] = [];
    ws.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      if (rowNumber === 1) return;
      const cells: Record<string, Cell> = {};
      let any = false;
      for (const [col, name] of byColumn) {
        const v = cellValue(row.getCell(col).value);
        cells[name] = v;
        if (v !== null) any = true;
      }
      if (any) rows.push({ rowNumber, cells });
    });
    return { name: ws.name.trim(), headers, rows };
  });
}
