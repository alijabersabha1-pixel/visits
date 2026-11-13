import type { Metadata } from "next";
import { requirePermission } from "@/lib/session";
import { cardMonthly } from "@/lib/cards";
import { prisma } from "@/lib/db";
import { todayLocal, TIME_ZONE } from "@/lib/dates";
import { PrintHeader } from "@/components/print-ui";

export const metadata: Metadata = { title: "تقرير البطاقات الشهري" };

const money = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const dt = new Intl.DateTimeFormat("en-GB", { dateStyle: "short", timeStyle: "short", timeZone: TIME_ZONE });
const LINK: Record<string, string> = { VISIT: "زيارة", EXTERNAL: "فحص خارجي", VPN: "حالة VPN", NONE: "—" };

/** تقرير آخر الشهر للصرف */
export default async function PrintCards({ searchParams }: { searchParams: Promise<{ month?: string; owner?: string }> }) {
  const me = await requirePermission("export");
  const sp = await searchParams;
  const month = /^\d{4}-\d{2}$/.test(sp.month ?? "") ? sp.month! : todayLocal().slice(0, 7);
  const ownerId = sp.owner && /^[0-9a-f-]{36}$/i.test(sp.owner) ? sp.owner : undefined;
  const [m, owner] = await Promise.all([
    cardMonthly({ month, ownerId }),
    ownerId ? prisma.user.findUnique({ where: { id: ownerId }, select: { displayName: true } }) : null,
  ]);
  return (
    <>
      <PrintHeader
        title={`تقرير شراء البطاقات · ${month}`}
        subtitle={owner ? `السفير: ${owner.displayName}` : "كل الفريق"}
        by={me.displayName}
      />
      <table className="ptable">
        <thead>
          <tr>
            <th>#</th>
            <th>الوقت</th>
            <th>البطاقة أو الشبكة</th>
            <th>IP</th>
            <th>مرتبطة بـ</th>
            {!owner && <th>السفير</th>}
            <th>السعر (₪)</th>
          </tr>
        </thead>
        <tbody>
          {m.rows.map((c, i) => (
            <tr key={c.id}>
              <td>{i + 1}</td>
              <td className="ltr">{dt.format(c.filledAt)}</td>
              <td>{c.name}</td>
              <td className="ltr">{c.ip ?? ""}</td>
              <td>{LINK[c.linkKind]}</td>
              {!owner && <td>{c.owner.displayName}</td>}
              <td className="ltr">{money(Number(c.price))}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          {!owner &&
            m.byOwner.map((o) => (
              <tr key={o.ownerId}>
                <td colSpan={6}>
                  مجموع {o.name} ({o.count} بطاقة)
                </td>
                <td className="ltr">{money(o.total)}</td>
              </tr>
            ))}
          <tr>
            <td colSpan={owner ? 5 : 6}>المجموع ({m.rows.length} بطاقة)</td>
            <td className="ltr" data-testid="cards-total">
              {money(m.total)}
            </td>
          </tr>
        </tfoot>
      </table>
      <p style={{ marginTop: 40, display: "flex", justifyContent: "space-between" }}>
        <span>توقيع السفير: ____________</span>
        <span>توقيع المسؤول: ____________</span>
      </p>
    </>
  );
}
