import type { Metadata } from "next";
import Link from "next/link";
import { requirePermission } from "@/lib/session";
import { can } from "@/lib/authz";
import { lookupLine } from "@/lib/search";
import { isValidLineCode } from "@/lib/line-code";
import { fmtDay, RecBadge, VisitTable } from "@/components/visit-ui";
import { MikrotikAnswers } from "@/components/FieldExtras";
import { CredentialBox } from "@/components/CredentialBox";
import { lastMikrotikAnswers } from "@/lib/mikrotik";
import { credentialFor } from "@/lib/mikrotik-credentials";

export const metadata: Metadata = { title: "البحث بالـ Line Code" };

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ code?: string }> }) {
  const me = await requirePermission("visits:view");
  const code = ((await searchParams).code ?? "").trim().slice(0, 60);
  const r = code && isValidLineCode(code) ? await lookupLine(code) : null;
  const last = r?.visits[0];
  const metrics = (r?.target?.metrics ?? null) as Record<string, string | number> | null;
  const hasLine = !!r && (!!r.line || r.visits.length > 0);
  const [mikrotik, cred] = hasLine
    ? await Promise.all([
        lastMikrotikAnswers(r!.codeKey),
        can(me, "mikrotik:reveal") ? credentialFor(r!.codeKey) : Promise.resolve(null),
      ])
    : [null, null];

  return (
    <>
      <div className="page-head">
        <div>
          <h1>البحث بالـ Line Code</h1>
          <p className="muted">اكتب الكود بأي شكل: بشرطات أو بدونها، أحرف صغيرة أو كبيرة.</p>
        </div>
        <Link className="btn btn-ghost" href="/search/bulk">
          بحث جماعي
        </Link>
      </div>
      <form className="card card-pad actions" method="get" style={{ marginBottom: 16 }} role="search">
        <label className="sr-only" htmlFor="code">
          Line Code
        </label>
        <input
          id="code"
          name="code"
          className="input ltr"
          style={{ maxWidth: 320 }}
          defaultValue={code}
          placeholder="G-7872-002"
          autoFocus
          autoComplete="off"
        />
        <button className="btn btn-primary" type="submit">
          بحث
        </button>
      </form>

      {code && !isValidLineCode(code) && <div className="alert alert-warn">الكود مش صالح.</div>}
      {r && !r.line && r.visits.length === 0 && (
        <div className="alert alert-warn">
          الخط <b className="ltr">{code}</b> مش موجود بالمشتركين وما إله زيارات.
          {can(me, "visits:create") && (
            <>
              {" "}
              <Link href={`/visits/new?code=${encodeURIComponent(code)}`}>سجّل زيارة</Link>
            </>
          )}
        </div>
      )}

      {r && (r.line || r.visits.length > 0) && (
        <div className="grid">
          <section className="card card-pad grid" aria-label="بطاقة الخط">
            <div className="page-head" style={{ margin: 0 }}>
              <div>
                <h2 style={{ fontSize: 20 }}>{r.line?.accountName ?? last?.accountName ?? "—"}</h2>
                <div className="ltr muted" style={{ textAlign: "right" }}>
                  {r.line?.code ?? last?.lineCode}
                </div>
              </div>
              <div className="actions">
                {r.line?.manual && <span className="badge badge-blue">مضاف يدوياً</span>}
                {r.line && !r.line.inLatestFile && <span className="badge badge-gray">مش موجود بآخر ملف</span>}
                {!r.line && <span className="badge badge-warn">مش بملف المشتركين</span>}
                {can(me, "visits:create") && (
                  <Link
                    className="btn btn-primary btn-sm"
                    href={`/visits/new?code=${encodeURIComponent(r.line?.code ?? code)}`}
                  >
                    زيارة جديدة لهالخط
                  </Link>
                )}
              </div>
            </div>
            <dl className="kv">
              <div>
                <dt>المنطقة</dt>
                <dd>{r.line?.region ?? "—"}</dd>
              </div>
              <div>
                <dt>المكان</dt>
                <dd>
                  {[r.line?.locality, r.line?.addrLocality, r.line?.addrQuarter].filter(Boolean).join(" · ") || "—"}
                </dd>
              </div>
              <div>
                <dt>السرعة</dt>
                <dd className="ltr" style={{ textAlign: "right" }}>
                  {r.line?.speed ?? "—"}
                </dd>
              </div>
              <div>
                <dt>IP</dt>
                <dd className="ltr" style={{ textAlign: "right" }}>
                  {r.line?.fixedIp ?? "—"}
                </dd>
              </div>
              <div>
                <dt>مدير الحساب</dt>
                <dd className="ltr" style={{ textAlign: "right" }}>
                  {r.line?.accountManager ?? "—"}
                </dd>
              </div>
              <div>
                <dt>عدد الزيارات</dt>
                <dd>{r.visits.length}</dd>
              </div>
              <div>
                <dt>آخر زيارة</dt>
                <dd>
                  {last ? (
                    <>
                      {fmtDay(last.visitedOn)}{" "}
                      <RecBadge label={last.recommendation?.label} color={last.recommendation?.color} />
                    </>
                  ) : (
                    "—"
                  )}
                </dd>
              </div>
              {r.target && (
                <div>
                  <dt>زيارات الشهر</dt>
                  <dd>
                    <span className="ltr">{r.target.month}</span> · {r.target.sheet}
                    {r.target.excluded && <span className="badge badge-warn"> مستثنى</span>}
                    {r.target.teamNote && <div className="small muted">{r.target.teamNote}</div>}
                  </dd>
                </div>
              )}
            </dl>
            {metrics && Object.keys(metrics).length > 0 && (
              <div className="small muted">
                {Object.entries(metrics)
                  .map(([k, v]) => `${k}: ${typeof v === "number" ? Math.round(v * 100) / 100 : v}`)
                  .join(" · ")}
              </div>
            )}
            {(mikrotik || can(me, "mikrotik:reveal")) && (
              <div className="grid" style={{ gap: 8 }}>
                <h3 style={{ fontSize: 15, margin: 0 }}>المايكروتيك</h3>
                {mikrotik ? (
                  <>
                    <div className="small muted">
                      آخر إجابات · <Link href={`/visits/${mikrotik.visitId}`}>زيارة {fmtDay(mikrotik.visitedOn)}</Link>
                    </div>
                    <MikrotikAnswers answers={mikrotik.answers} />
                  </>
                ) : (
                  <div className="small muted">ما في إجابات مايكروتيك لهالخط لسا.</div>
                )}
                {can(me, "mikrotik:reveal") && (
                  <CredentialBox
                    lineCode={r.line?.code ?? last?.lineCode ?? code}
                    cred={cred ? { id: cred.id, username: cred.username } : null}
                  />
                )}
              </div>
            )}
          </section>

          <section className="card" aria-label="الزيارات">
            <div className="card-head">
              <h2>الزيارات ({r.visits.length})</h2>
              {can(me, "export") && r.visits.length > 0 && (
                <span className="actions">
                  <a className="btn btn-ghost btn-sm" href={`/api/export/line?code=${encodeURIComponent(code)}&format=pdf`}>
                    تقرير الخط PDF
                  </a>
                  <a className="btn btn-ghost btn-sm" href={`/api/export/line?code=${encodeURIComponent(code)}`}>
                    Excel
                  </a>
                </span>
              )}
            </div>
            <VisitTable rows={r.visits} showRegion={false} empty="ما في زيارات لهالخط." />
          </section>

          {r.managerLog.length > 0 && (
            <section className="card" aria-label="سجل الإدارة">
              <div className="card-head">
                <h2>سجل الإدارة</h2>
                <span className="muted small">من ملف المسؤول، للاطلاع</span>
              </div>
              <div className="table-wrap">
                <table className="table stack">
                  <thead>
                    <tr>
                      <th>التاريخ</th>
                      <th>توصية السفراء</th>
                      <th>الإجراء النهائي لمدير المنطقة</th>
                      <th>ملاحظات الفريق</th>
                    </tr>
                  </thead>
                  <tbody>
                    {r.managerLog.map((m) => (
                      <tr key={m.id}>
                        <td className="cell-main small">{fmtDay(m.visitDate)}</td>
                        <td data-label="توصية السفراء">{m.recommendation ?? "—"}</td>
                        <td data-label="الإجراء النهائي">{m.finalAction ?? "—"}</td>
                        <td data-label="ملاحظات الفريق" className="small">
                          {m.teamNote ?? "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {r.siblings.length > 0 && (
            <section className="card card-pad" aria-label="خطوط نفس الحساب">
              <h2 style={{ marginBottom: 10 }}>خطوط نفس الحساب</h2>
              <div className="actions">
                {r.siblings.map((s) => (
                  <Link
                    key={s.id}
                    className="btn btn-ghost btn-sm ltr"
                    href={`/search?code=${encodeURIComponent(s.code)}`}
                  >
                    {s.code}
                  </Link>
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </>
  );
}
