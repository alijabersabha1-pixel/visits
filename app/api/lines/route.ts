import { NextResponse } from "next/server";
import { handler, apiRequire, parseBody } from "@/lib/api";
import { addManualLine, manualLineSchema } from "@/lib/lines";

/** إضافة خط طارئ يدوياً (السفير) */
export const POST = handler(async (req) => {
  const actor = await apiRequire(req, "subscribers:import");
  const input = await parseBody(req, manualLineSchema);
  const line = await addManualLine(actor.id, input);
  return NextResponse.json({ line }, { status: 201 });
});
