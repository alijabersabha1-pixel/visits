import type { Metadata } from "next";
import Link from "next/link";
import { requirePermission } from "@/lib/session";
import { can } from "@/lib/authz";
import { cardDaily, cardMonthly } from "@/lib/cards";
import { prisma } from "@/lib/db";
import { todayLocal, TIME_ZONE } from "@/lib/dates";
import { CardSiteForm } from "@/components/SiteFieldForms";

export const metadata: Metadata = { title: "البطاقات" };

const money = (n: number) => `${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₪`;
const timeFmt = new Intl.DateTimeFormat("ar-PS-u-nu-latn", { timeStyle: "short", timeZone: TIME_ZONE });
const LINK: Record<string, string> = { VISIT: "زيارة", EXTERNAL: "فحص خارجي", VPN: "حالة VPN", NONE: "—" };

export default async function CardsPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; owner?: string }>;
}) {
  const me = await requirePermission("visits:view");
  const sp = await searchParams;
  const month = /^\d{4}-\d{2}$/.test(sp.month ?? "") ? sp.month! : todayLocal().slice(0, 7);
  const ownerId = sp.owner && /^[0-9a-f-]{36}$/i.test(sp.owner) ? sp.owner : undefined;
  const [days, monthly, users] = await Promise.all([
    cardDaily({ month, ownerId }),
    cardMonthly({ month, ownerId }),
    prisma.user.findMany({
      where: { role: "AMBASSADOR" },
      select: { id: true, displayName: true },
      orderBy: { displayName: "asc" },
    }),
  ]);
  const byDay = new Map<string, typeof monthly.rows>();
  for (const r of monthly.rows) {
    const d = new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE }).format(r.filledAt);
    byDay.set(d, [...(byDay.get(d) ?? []), r]);
  }
  const reportQs = new URLSearchParams({ month, ...(ownerId ? { owner: ownerId } : {}) }).toString();

  return (
    <>
      <div className="page-head">
        <div>
          <h1>شراء البطاقات</h1>
          <p className="muted">ملخص يومي بالعدد والمجموع. اضغط على اليوم لتشوف كل بطاقة.</p>
        </div>
        <Link className="btn btn-ghost" href={`/cards/report?${reportQs}`}>
          تقرير الشهر للصرف
        </Link>
      </div>
      {can(me, "visits:create") && <CardSiteForm />}
      <div className="card">
        <form className="filters form-grid" method="get">
          <div className="field">
            <label htmlFor="cm">الشهر</label>
            <input id="cm" name="month" type="month" className="input" defaultValue={month} />
          </div>
          <div className="field">
            <label htmlFor="co">السفير</label>
            <select id="co" name="owner" className="select" defaultValue={ownerId ?? ""}>
              <option value="">الكل</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.displayName}
                </option>
              ))}
            </select>
          </div>
          <div className="actions">
            <button className="btn btn-primary">عرض</button>
          </div>
        </form>
        <div className="filters actions" style={{ justifyContent: "space-between" }}>
          <b>
            مجموع الشهر: <span className="ltr">{money(monthly.total)}</span>
          </b>
          <span className="small muted">{monthly.rows.length} بطاقة</span>
        </div>
        {days.length === 0 ? (
          <div className="empty">ما في بطاقات بهالشهر.</div>
        ) : (
          days.map((d) => (
            <details key={d.day} className="list-row" style={{ display: "block" }} data-day={d.day}>
              <summary style={{ cursor: "pointer", display: "flex", justifyContent: "space-between" }}>
                <b className="ltr">{d.day}</b>
                <span>
                  {d.count} بطاقة · <b className="ltr">{money(d.total)}</b>
                </span>
              </summary>
              <table className="table" style={{ marginTop: 8 }}>
                <tbody>
                  {(byDay.get(d.day) ?? []).map((c) => (
                    <tr key={c.id}>
                      <td className="small muted">{timeFmt.format(c.filledAt)}</td>
                      <td>{c.name}</td>
                      <td className="ltr small">{c.ip ?? ""}</td>
                      <td className="small">{LINK[c.linkKind]}</td>
                      <td className="small">{c.owner.displayName}</td>
                      <td className="ltr">
                        <b>{money(Number(c.price))}</b>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </details>
          ))
        )}
      </div>
    </>
  );
}
