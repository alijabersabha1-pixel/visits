import { NextResponse } from "next/server";
import { handler } from "@/lib/api";
import { logout, SESSION_COOKIE } from "@/lib/auth";

export const POST = handler(async (req) => {
  await logout(req.cookies.get(SESSION_COOKIE)?.value);
  const res = NextResponse.json({ ok: true });
  res.cookies.delete(SESSION_COOKIE);
  return res;
});
