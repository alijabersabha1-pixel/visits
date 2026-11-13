import type { Metadata } from "next";
import Link from "next/link";
import { requirePermission } from "@/lib/session";
import { can } from "@/lib/authz";
import { openRevisits } from "@/lib/revisits";
import { REGIONS } from "@/lib/line-code";
import { fmtDay } from "@/components/visit-ui";
import { PostponeButton } from "@/components/VisitActions";

export const metadata: Metadata = { title: "إعادة الزيارة" };

export default async function RevisitsPage({ searchParams }: { searchParams: Promise<{ region?: string }> }) {
  const me = await requirePermission("visits:view");
  const { region } = await searchParams;
  const rows = await openRevisits(region && (REGIONS as readonly string[]).includes(region) ? { region } : {});
  const groups = new Map<string, typeof rows>();
  for (const r of rows) groups.set(r.region ?? "بدون منطقة", [...(groups.get(r.region ?? "بدون منطقة") ?? []), r]);
  const canAct = can(me, "visits:create");

  return (
    <>
      <div className="page-head">
        <div>
          <h1>بانتظار إعادة زيارة</h1>
          <p className="muted">
            الخطوط اللي توصيتها «إعادة زيارة» أو «زيارة غير ناجحة»، مرتبة حسب المنطقة عشان تجمع زيارات المنطقة بطلعة
            وحدة. أول ما تنسجل زيارة جديدة للخط بيطلع من هون لحاله.
          </p>
        </div>
      </div>
      <div className="actions" style={{ marginBottom: 16 }}>
        <Link className={`btn btn-sm ${!region ? "btn-primary" : "btn-ghost"}`} href="/revisits">
          الكل ({rows.length})
        </Link>
        {REGIONS.map((r) => (
          <Link
            key={r}
            className={`btn btn-sm ${region === r ? "btn-primary" : "btn-ghost"}`}
            href={`/revisits?region=${encodeURIComponent(r)}`}
          >
            {r}
          </Link>
        ))}
      </div>
      {rows.length === 0 && <div className="card empty">ما في ولا خط بانتظار إعادة زيارة.</div>}
      {[...groups.entries()].map(([g, list]) => (
        <section key={g} className="card" style={{ marginBottom: 16 }} aria-label={g}>
          <div className="card-head">
            <h2>
              {g} <span className="muted small">({list.length})</span>
            </h2>
          </div>
          <div className="table-wrap">
            <table className="table stack">
              <thead>
                <tr>
                  <th>الخط</th>
                  <th>آخر زيارة</th>
                  <th>التوصية</th>
                  <th>الموعد المقترح</th>
                  <th>التأجيل</th>
                  <th>
                    <span className="sr-only">إجراءات</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {list.map((r) => (
                  <tr key={r.id} data-revisit={r.lineCode ?? r.number}>
                    <td className="cell-main">
                      {r.lineCode ? (
                        <b className="ltr">{r.lineCode}</b>
                      ) : (
                        <span className="badge badge-warn">حالة خاصة</span>
                      )}{" "}
                      <span className="muted small">{r.accountName}</span>
                    </td>
                    <td data-label="آخر زيارة" className="small">
                      <Link href={`/visits/${r.id}`}>
                        <span className="ltr">#{r.number}</span> · {fmtDay(r.visitedOn)}
                      </Link>
                    </td>
                    <td data-label="التوصية" className="small">
                      {r.recommendation}
                    </td>
                    <td data-label="الموعد المقترح" className="small">
                      {r.revisitDue ? fmtDay(r.revisitDue) : "—"}
                    </td>
                    <td data-label="التأجيل" className="small">
                      {r.postponeCount > 0 ? (
                        <>
                          <span className={`badge ${r.postponeCount > 1 ? "badge-red" : "badge-warn"}`}>
                            {r.postponeCount} مرة
                          </span>{" "}
                          <span className="muted">{r.lastPostponeReason}</span>
                        </>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="cell-actions">
                      {canAct && (
                        <span className="actions">
                          <Link className="btn btn-primary btn-sm" href={`/visits/new?revisitOf=${r.id}`}>
                            سجّل الزيارة
                          </Link>
                          <PostponeButton visitId={r.id} />
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}
    </>
  );
}
