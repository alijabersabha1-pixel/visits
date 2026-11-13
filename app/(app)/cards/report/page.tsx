import type { Metadata } from "next";
import { requirePermission } from "@/lib/session";
import { cardMonthly } from "@/lib/cards";
import { prisma } from "@/lib/db";
import { todayLocal, TIME_ZONE } from "@/lib/dates";
import { PrintButton } from "@/components/PrintButton";

export const metadata: Metadata = { title: "تقرير البطاقات الشهري" };

const money = (n: number) => `${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₪`;
const dt = new Intl.DateTimeFormat("ar-PS-u-nu-latn", { dateStyle: "short", timeStyle: "short", timeZone: TIME_ZONE });

export default async function CardReport({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; owner?: string }>;
}) {
  await requirePermission("export");
  const sp = await searchParams;
  const month = /^\d{4}-\d{2}$/.test(sp.month ?? "") ? sp.month! : todayLocal().slice(0, 7);
  const ownerId = sp.owner && /^[0-9a-f-]{36}$/i.test(sp.owner) ? sp.owner : undefined;
  const [m, owner] = await Promise.all([
    cardMonthly({ month, ownerId }),
    ownerId ? prisma.user.findUnique({ where: { id: ownerId }, select: { displayName: true } }) : null,
  ]);
  return (
    <div className="print-page">
      <div className="page-head">
        <div>
          <h1>
            تقرير صرف البطاقات · <span className="ltr">{month}</span>
          </h1>
          <p className="muted">{owner ? `السفير: ${owner.displayName}` : "الفريق كله"}</p>
        </div>
        <div className="actions">
          <a className="btn btn-primary" href={`/api/export/cards?${new URLSearchParams({ month, ...(ownerId && { owner: ownerId }), format: "pdf" })}`}>
            PDF
          </a>
          <a className="btn btn-ghost" href={`/api/export/cards?${new URLSearchParams({ month, ...(ownerId && { owner: ownerId }) })}`}>
            Excel
          </a>
          <PrintButton />
        </div>
      </div>
      <div className="card">
        <table className="table">
          <thead>
            <tr>
              <th>#</th>
              <th>التاريخ</th>
              <th>البطاقة / الشبكة</th>
              <th>IP</th>
              <th>السفير</th>
              <th>السعر</th>
            </tr>
          </thead>
          <tbody>
            {m.rows.map((r, i) => (
              <tr key={r.id}>
                <td>{i + 1}</td>
                <td className="small">{dt.format(r.filledAt)}</td>
                <td>{r.name}</td>
                <td className="ltr small">{r.ip ?? ""}</td>
                <td>{r.owner.displayName}</td>
                <td className="ltr">{money(Number(r.price))}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={5}>
                <b>المجموع</b>
              </td>
              <td className="ltr">
                <b data-testid="card-total">{money(m.total)}</b>
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
      {!ownerId && m.byOwner.length > 1 && (
        <div className="card card-pad" style={{ marginTop: 16 }}>
          <h2>حسب السفير</h2>
          <table className="table">
            <tbody>
              {m.byOwner.map((o) => (
                <tr key={o.ownerId}>
                  <td>{o.name}</td>
                  <td>{o.count} بطاقة</td>
                  <td className="ltr">{money(o.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="small muted">PDF وExcel بالمرحلة 5. هلأ بتقدر تطبعها أو تحفظها PDF من زر الطباعة.</p>
    </div>
  );
}
