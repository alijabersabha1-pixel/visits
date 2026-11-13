import { NextResponse } from "next/server";
import { handler, apiRequire } from "@/lib/api";
import { findVpnCases } from "@/lib/vpn";

/** تنبيه بنموذج VPN: حالات سابقة بنفس الـ IP أو الاسم */
export const GET = handler(async (req) => {
  await apiRequire(req, "visits:view");
  const q = (req.nextUrl.searchParams.get("q") ?? "").slice(0, 100);
  const rows = q.trim().length >= 3 ? await findVpnCases({ q }) : [];
  return NextResponse.json({
    cases: rows.slice(0, 10).map((r) => ({
      id: r.id,
      networkName: r.networkName,
      ip: r.ip,
      filledAt: r.filledAt,
      owner: r.owner.displayName,
    })),
  });
});
