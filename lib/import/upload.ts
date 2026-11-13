/** قراءة طلب رفع ملف الشهر (multipart) والتحقق منه على حدود النظام */
import { z } from "zod";
import type { NextRequest } from "next/server";
import { ApiError } from "../errors";
import { FIELDS, type ColumnMap } from "./monthly";

export const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;
export const COLUMN_MAP_KEY = "import.monthly.columnMap";

const columnMapSchema = z.record(z.enum(Object.keys(FIELDS) as [keyof typeof FIELDS]), z.string().max(200)).optional();

export async function readUpload(
  req: NextRequest,
): Promise<{ buffer: Buffer; fileName: string; month: string; columnMap?: ColumnMap }> {
  const len = Number(req.headers.get("content-length") ?? 0);
  if (len > MAX_UPLOAD_BYTES + 100_000) throw new ApiError(413, "الملف أكبر من 15 ميغا");
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    throw new ApiError(400, "الطلب مش مفهوم");
  }
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) throw new ApiError(400, "اختار ملف الشهر");
  if (file.size > MAX_UPLOAD_BYTES) throw new ApiError(413, "الملف أكبر من 15 ميغا");
  if (!/\.xlsx$/i.test(file.name)) throw new ApiError(400, "الملف لازم يكون إكسل (.xlsx)");
  const month = String(form.get("month") ?? "");
  let columnMap: ColumnMap | undefined;
  const rawMap = form.get("columnMap");
  if (typeof rawMap === "string" && rawMap) {
    try {
      columnMap = columnMapSchema.parse(JSON.parse(rawMap));
    } catch {
      throw new ApiError(400, "خريطة الأعمدة مش صالحة");
    }
  }
  return { buffer: Buffer.from(await file.arrayBuffer()), fileName: file.name, month, columnMap };
}
