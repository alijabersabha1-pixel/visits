import { NextResponse } from "next/server";
import { handler, apiUser } from "@/lib/api";

export const GET = handler(async (req) => {
  const { id, username, displayName, role, mustChangePassword } = await apiUser(req);
  return NextResponse.json({ id, username, displayName, role, mustChangePassword });
});
