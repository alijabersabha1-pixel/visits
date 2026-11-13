import Link from "next/link";
import { requireUser } from "@/lib/session";
import { can } from "@/lib/authz";
import { dashboardStats } from "@/lib/stats";
import { todayLocal } from "@/lib/dates";
import { MonthlyChart } from "@/components/charts/MonthlyChart";
import { BarList } from "@/components/charts/BarList";

const nf = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });
const dayFmt = new Intl.DateTimeFormat("ar-PS-u-nu-latn", {
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "Asia/Hebron",
});

export default async function HomePage({ searchParams }: { searchParams: Promise<{ denied?: string }> }) {
  const user = await requireUser();
  const { denied } = await searchParams;
  const today = todayLocal();
  const isAmb = user.role === "AMBASSADOR";

  const header = (
    <div className="page-head">
      <div>
        <h1>أهلاً {user.displayName}</h1>
        <p className="muted">{dayFmt.format(new Date())}</p>
      </div>
      {can(user, "visits:create") && (
        <div className="actions">
          <Link className="btn btn-primary" href="/visits/new">
            زيارة جديدة
          </Link>
          <Link className="btn btn-ghost" href="/search">
            بحث بالـ Line Code
          </Link>
        </div>
      )}
    </div>
  );

  if (!can(user, "stats:view")) return header;
  const s = await dashboardStats({ today, userId: user.id });
  const month = today.slice(0, 7);
  const a = s.alerts;

  return (
    <>
      {header}
      {denied && (
        <div className="alert alert-warn" role="alert" style={{ marginBottom: 16 }}>
          ما عندك صلاحية لهالصفحة.
        </div>
      )}

      <section className="kpis" aria-label="الأرقام">
        <Link className="card stat" href={`/visits?from=${today}&to=${today}`}>
          <div className="label">زيارات اليوم</div>
          <div className="value">{s.visits.today}</div>
          <div className="sub">
            هالأسبوع {s.visits.week} · هالشهر {s.visits.month}
          </div>
        </Link>
        <div className="card stat">
          <div className="label">نسبة التجاوزات هالشهر</div>
          <div className="value">
            {nf.format(s.violations.monthRate)}
            <span className="unit">%</span>
          </div>
          <div className="sub">
            {s.violations.month} من {s.visits.month} زيارة · الكلي {nf.format(s.violations.totalRate)}%
          </div>
        </div>
        <Link className="card stat" href="/revisits">
          <div className="label">بانتظار إعادة زيارة</div>
          <div className="value">{s.openRevisits}</div>
          <div className="sub">{a.postponedTwice.length} متأجلة أكتر من مرة</div>
        </Link>
        <Link className="card stat" href={`/cards?month=${month}`}>
          <div className="label">مصروف البطاقات هالشهر</div>
          <div className="value">
            {nf.format(s.cards.monthTotal)}
            <span className="unit">₪</span>
          </div>
          <div className="sub">{s.cards.monthCount} بطاقة</div>
        </Link>
      </section>

      <div className="dash-grid">
        <section className="card" aria-label="الزيارات شهرياً" style={{ gridColumn: "1 / -1" }}>
          <div className="card-head">
            <h2>الزيارات شهرياً حسب التوصية</h2>
            <span className="muted small">{s.visits.total} زيارة بالمجموع</span>
          </div>
          <div className="card-pad">
            <MonthlyChart months={s.monthly} />
          </div>
        </section>

        <section className="card" aria-label="توزيع الإجراءات">
          <div className="card-head">
            <h2>توزيع الإجراءات</h2>
            <span className="muted small">كل الزيارات</span>
          </div>
          <div className="card-pad">
            <BarList rows={s.actions} muted={["بدون إجراء"]} />
          </div>
        </section>

        <section className="card" aria-label="زيارات كل سفير">
          <div className="card-head">
            <h2>زيارات كل سفير</h2>
          </div>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>السفير</th>
                  <th>هالشهر</th>
                  <th>الكل</th>
                </tr>
              </thead>
              <tbody>
                {s.byAmbassador.map((r) => (
                  <tr key={r.name}>
                    <td>{r.name}</td>
                    <td>
                      <b>{r.month}</b>
                    </td>
                    <td>{r.total}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="card" aria-label="تنبيهات" style={{ gridColumn: "1 / -1" }}>
          <div className="card-head">
            <h2>تنبيهات</h2>
          </div>
          <div className="alerts-grid">
            <div>
              <h3 className="alert-title">
                تجاوزات بدون إجراء <span className="badge badge-red">{a.violationsNoAction.length}</span>
              </h3>
              {a.violationsNoAction.length === 0 ? (
                <p className="small muted">ولا وحدة.</p>
              ) : (
                <ul className="alert-list">
                  {a.violationsNoAction.slice(0, 8).map((v) => (
                    <li key={v.id}>
                      <Link href={`/visits/${v.id}`}>
                        <span className="ltr">{v.lineCode ?? `#${v.number}`}</span>
                      </Link>{" "}
                      <span className="muted small">{v.accountName}</span>
                    </li>
                  ))}
                  {a.violationsNoAction.length > 8 && (
                    <li className="small muted">و{a.violationsNoAction.length - 8} كمان</li>
                  )}
                </ul>
              )}
            </div>
            <div>
              <h3 className="alert-title">
                إعادات زيارة متأجلة أكتر من مرة <span className="badge badge-warn">{a.postponedTwice.length}</span>
              </h3>
              {a.postponedTwice.length === 0 ? (
                <p className="small muted">ولا وحدة.</p>
              ) : (
                <ul className="alert-list">
                  {a.postponedTwice.slice(0, 8).map((v) => (
                    <li key={v.id}>
                      <Link href={`/visits/${v.id}`}>
                        <span className="ltr">{v.lineCode ?? `#${v.number}`}</span>
                      </Link>{" "}
                      <span className="muted small">تأجلت {v.postponeCount} مرات</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div>
              <h3 className="alert-title">
                خطوط بحاجة access <span className="badge badge-blue">{a.needAccess}</span>
              </h3>
              <p className="small">
                <Link href="/mikrotik/access">افتح القائمة</Link>
              </p>
            </div>
            {isAmb && (
              <div>
                <h3 className="alert-title">
                  طلبات تعديل بانتظارك <span className="badge badge-blue">{a.pendingRequests}</span>
                </h3>
                <p className="small">
                  <Link href="/inbox">افتح الطلبات</Link>
                </p>
              </div>
            )}
          </div>
        </section>
      </div>
    </>
  );
}
