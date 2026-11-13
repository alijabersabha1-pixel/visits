import { NextResponse } from "next/server";
import { handler, apiRequire } from "@/lib/api";
import { findLineByCode } from "@/lib/lines";
import { openRevisits } from "@/lib/revisits";
import { isValidLineCode, normalizeLineCode } from "@/lib/line-code";

/** بنموذج الزيارة: اسم الحساب وهل الخط بانتظار إعادة زيارة */
export const GET = handler(async (req) => {
  await apiRequire(req, "visits:view");
  const code = req.nextUrl.searchParams.get("code") ?? "";
  if (!isValidLineCode(code)) return NextResponse.json({ valid: false });
  const line = await findLineByCode(code);
  const open = await openRevisits({ lineCodeKey: normalizeLineCode(code) });
  return NextResponse.json({
    valid: true,
    line: line && { code: line.code, accountName: line.accountName, region: line.region, speed: line.speed },
    openRevisit: open[0] ? { id: open[0].id, number: open[0].number } : null,
  });
});
