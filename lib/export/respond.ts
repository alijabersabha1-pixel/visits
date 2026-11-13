import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE } from "../auth";
import { ApiError } from "../errors";
import { renderPdf } from "./pdf";

const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/** اسم الملف بالعربي بيشتغل بكل المتصفحات بـ filename* */
function disposition(name: string) {
  const ascii = name.replace(/[^\x20-\x7e]/g, "_");
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`;
}

export function fileResponse(body: Buffer, name: string, type: "xlsx" | "pdf") {
  return new NextResponse(new Uint8Array(body), {
    headers: {
      "Content-Type": type === "xlsx" ? XLSX : "application/pdf",
      "Content-Disposition": disposition(name),
      "Cache-Control": "no-store",
    },
  });
}

export async function pdfResponse(req: NextRequest, printPath: string, name: string) {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  if (!token) throw new ApiError(401, "لازم تسجّل دخول");
  try {
    return fileResponse(await renderPdf(printPath, token), name, "pdf");
  } catch (err) {
    console.error("pdf", err);
    throw new ApiError(503, "ما قدرنا نعمل الـ PDF هلأ. افتح صفحة الطباعة واطبع منها.");
  }
}

export const stamp = () => new Date().toISOString().slice(0, 10);
