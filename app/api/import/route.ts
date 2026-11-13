import { NextResponse } from "next/server";
import { handler, apiRequire } from "@/lib/api";
import { applyMonthlyImport } from "@/lib/import/monthly";
import { COLUMN_MAP_KEY, readUpload } from "@/lib/import/upload";
import { getSetting, setSetting } from "@/lib/settings";
import { withAudit } from "@/lib/audit";
import type { ColumnMap } from "@/lib/import/monthly";

/** حفظ ملف الشهر. خريطة الأعمدة المستعملة بتنحفظ للشهر الجاي */
export const POST = handler(async (req) => {
  const actor = await apiRequire(req, "subscribers:import");
  const up = await readUpload(req);
  const columnMap = up.columnMap ?? (await getSetting<ColumnMap>(COLUMN_MAP_KEY, {}));
  const result = await applyMonthlyImport(actor.id, up.buffer, { month: up.month, fileName: up.fileName, columnMap });
  if (up.columnMap) {
    const saved = await getSetting<ColumnMap>(COLUMN_MAP_KEY, {});
    if (JSON.stringify(saved) !== JSON.stringify(up.columnMap)) {
      await withAudit(actor.id, async (tx, audit) => {
        await setSetting(COLUMN_MAP_KEY, up.columnMap!, tx);
        audit.updated(
          "Setting",
          COLUMN_MAP_KEY,
          { value: saved },
          { value: up.columnMap },
          { note: "خريطة أعمدة ملف الشهر" },
        );
      });
    }
  }
  return NextResponse.json(result, { status: 201 });
});
