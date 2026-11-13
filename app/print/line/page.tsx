import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/session";
import { lookupLine } from "@/lib/search";
import { fmtDay } from "@/components/visit-ui";
import { Dot, PrintHeader } from "@/components/print-ui";

export const metadata: Metadata = { title: "تقرير خط" };

/** تقرير خط واحد بكل تاريخه */
export default async function PrintLine({ searchParams }: { searchParams: Promise<{ code?: string }> }) {
  const me = await requirePermission("export");
  const { code } = await searchParams;
  const r = code ? await lookupLine(code) : null;
  if (!r || (!r.line && r.visits.length === 0)) notFound();
  const l = r.line;
  const shown = l?.code ?? r.visits[0]?.lineCode ?? code;
  return (
    <>
      <PrintHeader title={`تقرير الخط ${shown}`} subtitle={l?.accountName ?? r.visits[0]?.accountName ?? ""} by={me.displayName} />
      <div className="summary-row">
        <span>
          <b>Line Code:</b> <span className="ltr">{shown}</span>
        </span>
        {l?.speed && (
          <span>
            <b>السرعة:</b> {l.speed}
          </span>
        )}
        {l?.fixedIp && (
          <span>
            <b>IP:</b> <span className="ltr">{l.fixedIp}</span>
          </span>
        )}
        {l?.region && (
          <span>
            <b>المنطقة:</b> {[l.region, l.locality].filter(Boolean).join(" · ")}
          </span>
        )}
        {l?.accountManager && (
          <span>
            <b>مدير الحساب:</b> {l.accountManager}
          </span>
        )}
        <span>
          <b>عدد الزيارات:</b> {r.visits.length}
        </span>
      </div>
      {r.visits.map((v) => (
        <article key={v.id} className="visit-block">
          <h2>
            <span>
              {fmtDay(v.visitedOn)} · {v.owner?.displayName ?? "غير محدد"}
            </span>
            <span className="ltr">#{v.number}</span>
          </h2>
          <dl className="vb-grid">
            <div>
              <dt>التوصية</dt>
              <dd>
                {v.recommendation && <Dot color={v.recommendation.color} />}
                {v.recommendation?.label ?? "—"}
              </dd>
            </div>
            <div>
              <dt>الإجراء</dt>
              <dd>{v.action?.label ?? "—"}</dd>
            </div>
            <div>
              <dt>إعادة الزيارة</dt>
              <dd>{v.revisitNote ?? (v.revisitDue ? fmtDay(v.revisitDue) : "—")}</dd>
            </div>
          </dl>
          {v.tests && <p className="vb-text">{v.tests}</p>}
          {v.result && <p className="vb-text">{v.result}</p>}
        </article>
      ))}
      {r.siblings.length > 0 && (
        <p className="small">
          <b>خطوط نفس الحساب:</b> <span className="ltr">{r.siblings.map((s) => s.code).join("، ")}</span>
        </p>
      )}
    </>
  );
}
