import { handler, apiRequire, notFound } from "@/lib/api";
import { exportVisits, visitsWorkbook } from "@/lib/export/visits";
import { fileResponse, pdfResponse } from "@/lib/export/respond";
import { isValidLineCode, normalizeLineCode } from "@/lib/line-code";
import { prisma } from "@/lib/db";

/** تقرير خط واحد بكل تاريخه */
export const GET = handler(async (req) => {
  await apiRequire(req, "export");
  const code = req.nextUrl.searchParams.get("code") ?? "";
  if (!isValidLineCode(code)) throw notFound();
  const key = normalizeLineCode(code);
  const name = `خط-${code.toUpperCase().replace(/[^A-Z0-9-]/g, "")}`;
  if (req.nextUrl.searchParams.get("format") === "pdf") {
    return pdfResponse(req, `/print/line?code=${encodeURIComponent(code)}`, `${name}.pdf`);
  }
  const ids = (await prisma.visit.findMany({ where: { lineCodeKey: key, deletedAt: null }, select: { id: true } })).map((v) => v.id);
  if (ids.length === 0) throw notFound();
  return fileResponse(await visitsWorkbook(await exportVisits({ ids })), `${name}.xlsx`, "xlsx");
});
