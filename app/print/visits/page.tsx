import type { Metadata } from "next";
import { requirePermission } from "@/lib/session";
import { exportVisits } from "@/lib/export/visits";
import { selectionFrom } from "@/lib/export/params";
import { fmtDay } from "@/components/visit-ui";
import { Dot, PrintHeader } from "@/components/print-ui";
import type { MikrotikAnswer } from "@/lib/mikrotik";
import { prisma } from "@/lib/db";

export const metadata: Metadata = { title: "تقرير الزيارات" };

type SP = Record<string, string | string[] | undefined>;

export default async function PrintVisits({ searchParams }: { searchParams: Promise<SP> }) {
  const me = await requirePermission("export");
  const sel = selectionFrom(await searchParams);
  const rows = await exportVisits(sel);
  const colors = new Map(
    (await prisma.listItem.findMany({ where: { kind: "RECOMMENDATION" }, select: { label: true, color: true } })).map((r) => [
      r.label,
      r.color,
    ]),
  );
  const dates = rows.map((r) => r.visitedOn).filter((d): d is Date => !!d);
  const range = dates.length ? `${fmtDay(dates.at(-1))} — ${fmtDay(dates[0])}` : "";
  const subtitle = `${rows.length} زيارة${range ? ` · ${range}` : ""}${sel.ids ? " · زيارات محددة" : ""}`;

  return (
    <>
      <PrintHeader title={sel.mode === "full" ? "تقرير الزيارات المفصّل" : "تقرير الزيارات"} subtitle={subtitle} by={me.displayName} />
      {sel.mode === "table" ? (
        <table className="ptable">
          <thead>
            <tr>
              <th>م.</th>
              <th>التاريخ</th>
              <th>الخط</th>
              <th>الحساب</th>
              <th>المنطقة</th>
              <th>السفير</th>
              <th>التوصية</th>
              <th>الإجراء</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((v) => (
              <tr key={v.id}>
                <td className="ltr">{v.number}</td>
                <td>{fmtDay(v.visitedOn)}</td>
                <td className="ltr">{v.specialCase ? "حالة خاصة" : (v.line?.code ?? v.lineCode)}</td>
                <td>{v.accountName ?? v.line?.accountName ?? ""}</td>
                <td>{v.line?.region ?? ""}</td>
                <td>{v.owner?.displayName ?? "غير محدد"}</td>
                <td>
                  {v.recommendation && <Dot color={colors.get(v.recommendation.label)} />}
                  {v.recommendation?.label ?? ""}
                </td>
                <td>{v.action?.label ?? ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        rows.map((v) => {
          const mk = (v.mikrotik as MikrotikAnswer[] | null) ?? [];
          return (
            <article key={v.id} className="visit-block">
              <h2>
                <span>
                  {v.specialCase ? "حالة خاصة" : <span className="ltr">{v.line?.code ?? v.lineCode}</span>} ·{" "}
                  {v.accountName ?? v.line?.accountName ?? ""}
                </span>
                <span className="ltr">#{v.number}</span>
              </h2>
              <dl className="vb-grid">
                <div>
                  <dt>التاريخ</dt>
                  <dd>{fmtDay(v.visitedOn)}</dd>
                </div>
                <div>
                  <dt>السفير</dt>
                  <dd>
                    {v.owner?.displayName ?? "غير محدد"}
                    {v.companions && ` + ${v.companions}`}
                  </dd>
                </div>
                <div>
                  <dt>المنطقة</dt>
                  <dd>{v.line?.region ?? v.place ?? "—"}</dd>
                </div>
                <div>
                  <dt>التوصية</dt>
                  <dd>
                    {v.recommendation && <Dot color={colors.get(v.recommendation.label)} />}
                    {v.recommendation?.label ?? "—"}
                  </dd>
                </div>
                <div>
                  <dt>الإجراء</dt>
                  <dd>{v.action?.label ?? "—"}</dd>
                </div>
                <div>
                  <dt>الموقع</dt>
                  <dd className="ltr">{v.lat !== null && v.lng !== null ? `${v.lat.toFixed(5)}, ${v.lng.toFixed(5)}` : "—"}</dd>
                </div>
              </dl>
              {v.tests && (
                <>
                  <div className="vb-label">الفحوصات</div>
                  <p className="vb-text">{v.tests}</p>
                </>
              )}
              {v.result && (
                <>
                  <div className="vb-label">النتيجة</div>
                  <p className="vb-text">{v.result}</p>
                </>
              )}
              {mk.length > 0 && (
                <>
                  <div className="vb-label">المايكروتيك</div>
                  <p className="vb-text">{mk.map((a) => `${a.question} ${a.answer}`).join(" · ")}</p>
                </>
              )}
              {v.revisitNote && (
                <>
                  <div className="vb-label">إعادة الزيارة</div>
                  <p className="vb-text">{v.revisitNote}</p>
                </>
              )}
            </article>
          );
        })
      )}
      {rows.length === 0 && <p className="muted">ما في زيارات.</p>}
    </>
  );
}
