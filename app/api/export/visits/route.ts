import { handler, apiRequire } from "@/lib/api";
import { exportVisits, visitsWorkbook } from "@/lib/export/visits";
import { selectionFrom, selectionQuery } from "@/lib/export/params";
import { fileResponse, pdfResponse, stamp } from "@/lib/export/respond";

/** ‎/api/export/visits?format=xlsx|pdf&mode=table|full&ids=…  أو نفس فلاتر صفحة الزيارات */
export const GET = handler(async (req) => {
  await apiRequire(req, "export");
  const sp = new URLSearchParams(req.nextUrl.searchParams);
  // زر «PDF مفصّل» بيبعت format=pdf-full
  if (sp.get("format") === "pdf-full") {
    sp.set("format", "pdf");
    sp.set("mode", "full");
  }
  if (sp.get("format") === "pdf") {
    return pdfResponse(req, `/print/visits?${selectionQuery(sp)}`, `زيارات-${stamp()}.pdf`);
  }
  const rows = await exportVisits(selectionFrom(sp));
  return fileResponse(await visitsWorkbook(rows), `زيارات-${stamp()}.xlsx`, "xlsx");
});
