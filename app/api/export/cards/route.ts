import { handler, apiRequire, ApiError } from "@/lib/api";
import { cardsWorkbook } from "@/lib/export/visits";
import { fileResponse, pdfResponse } from "@/lib/export/respond";

/** تقرير البطاقات الشهري للصرف */
export const GET = handler(async (req) => {
  await apiRequire(req, "export");
  const sp = req.nextUrl.searchParams;
  const month = sp.get("month") ?? "";
  if (!/^\d{4}-\d{2}$/.test(month)) throw new ApiError(400, "اختار الشهر");
  const owner = sp.get("owner");
  const ownerId = owner && /^[0-9a-f-]{36}$/i.test(owner) ? owner : undefined;
  if (sp.get("format") === "pdf") {
    const q = new URLSearchParams({ month, ...(ownerId && { owner: ownerId }) });
    return pdfResponse(req, `/print/cards?${q}`, `بطاقات-${month}.pdf`);
  }
  return fileResponse(await cardsWorkbook({ month, ownerId }), `بطاقات-${month}.xlsx`, "xlsx");
});
