import { NextResponse } from "next/server";
import { handler, apiRequire } from "@/lib/api";
import { analyzeMonthlyFile, FIELDS } from "@/lib/import/monthly";
import { COLUMN_MAP_KEY, readUpload } from "@/lib/import/upload";
import { getSetting } from "@/lib/settings";
import type { ColumnMap } from "@/lib/import/monthly";

/** معاينة ملف الشهر بدون حفظ */
export const POST = handler(async (req) => {
  await apiRequire(req, "subscribers:import");
  const up = await readUpload(req);
  const columnMap = up.columnMap ?? (await getSetting<ColumnMap>(COLUMN_MAP_KEY, {}));
  const plan = await analyzeMonthlyFile(up.buffer, { month: up.month, columnMap });
  return NextResponse.json({
    month: plan.month,
    summary: plan.summary,
    blocking: plan.blocking,
    sameFileImportedBefore: plan.sameFileImportedBefore,
    unknownLocalities: plan.unknownLocalities,
    sheets: plan.sheets.map(({ name, role, rows, headers, columns, extraColumns }) => ({
      name,
      role,
      rows,
      headers,
      columns,
      extraColumns,
    })),
    fields: Object.fromEntries(Object.entries(FIELDS).map(([k, v]) => [k, v.label])),
    columnMap,
    problems: plan.problems.slice(0, 300),
    changed: plan.lines.changed.slice(0, 200),
    newLines: plan.lines.new.slice(0, 200).map((l) => ({ code: l.code, accountName: l.accountName, region: l.region })),
  });
});
