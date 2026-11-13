import { NextResponse } from "next/server";
import { handler, apiUser, parseBody, ApiError } from "@/lib/api";
import { processSyncItem, syncItemSchema } from "@/lib/sync";

/** عنصر واحد من طابور الجوال بكل طلب (زيارة مع لغاية 5 صور مضغوطة) */
export const POST = handler(async (req) => {
  if (Number(req.headers.get("content-length") ?? 0) > 14 * 1024 * 1024) throw new ApiError(413, "العنصر كبير كتير");
  const actor = await apiUser(req);
  const result = await processSyncItem(actor, await parseBody(req, syncItemSchema));
  return NextResponse.json(result, { status: result.status === "created" ? 201 : 200 });
});
