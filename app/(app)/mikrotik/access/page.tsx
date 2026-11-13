import type { Metadata } from "next";
import Link from "next/link";
import { requirePermission } from "@/lib/session";
import { linesNeedingAccess } from "@/lib/mikrotik";
import { fmtDay } from "@/components/visit-ui";

export const metadata: Metadata = { title: "بحاجة access" };

export default async function AccessPage() {
  await requirePermission("visits:view");
  const rows = await linesNeedingAccess();
  return (
    <>
      <div className="page-head">
        <div>
          <h1>بحاجة access</h1>
          <p className="muted">خطوط آخر زيارة إلها قالت: ما في access للشركة على المايكروتيك، ولسا ما انعمل يوزر.</p>
        </div>
      </div>
      <div className="card">
        {rows.length === 0 ? (
          <div className="empty">ولا خط.</div>
        ) : (
          <div className="table-wrap">
            <table className="table stack">
              <tbody>
                {rows.map((r) => (
                  <tr key={r.lineCodeKey}>
                    <td className="cell-main">
                      <Link href={`/search?code=${encodeURIComponent(r.lineCode ?? r.lineCodeKey)}`} className="ltr">
                        <b>{r.lineCode}</b>
                      </Link>{" "}
                      <span className="muted small">{r.accountName}</span>
                    </td>
                    <td data-label="آخر زيارة" className="small">
                      <Link href={`/visits/${r.visitId}`}>{fmtDay(r.visitedOn)}</Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
