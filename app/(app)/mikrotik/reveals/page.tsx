import type { Metadata } from "next";
import { requirePermission } from "@/lib/session";
import { revealLog } from "@/lib/mikrotik-credentials";

export const metadata: Metadata = { title: "سجل عرض كلمات السر" };

const fmt = new Intl.DateTimeFormat("ar-PS-u-nu-latn", {
  dateStyle: "medium",
  timeStyle: "medium",
  timeZone: "Asia/Hebron",
});

export default async function RevealsPage() {
  const me = await requirePermission("mikrotik:revealLog");
  const rows = await revealLog(me);
  return (
    <>
      <div className="page-head">
        <div>
          <h1>سجل عرض كلمات سر المايكروتيك</h1>
          <p className="muted">مين عرض كلمة سر أي حساب ومتى. للسفراء بس، والمسؤول ما بيشوفه.</p>
        </div>
      </div>
      <div className="card">
        {rows.length === 0 ? (
          <div className="empty">ما حدا عرض كلمة سر لسا.</div>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>متى</th>
                <th>مين</th>
                <th>الحساب</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id.toString()}>
                  <td className="small">{fmt.format(r.at)}</td>
                  <td>{r.user.displayName}</td>
                  <td className="ltr">{r.lineCodeKey}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
