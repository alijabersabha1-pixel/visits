import { NextResponse } from "next/server";
import { handler, apiUser, parseBody } from "@/lib/api";
import { changeOwnPassword, changePasswordSchema } from "@/lib/users";

export const POST = handler(async (req) => {
  const user = await apiUser(req);
  const input = await parseBody(req, changePasswordSchema);
  await changeOwnPassword(user.id, user.sessionId, input);
  return NextResponse.json({ ok: true });
});
