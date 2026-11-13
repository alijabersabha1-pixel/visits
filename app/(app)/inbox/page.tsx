import type { Metadata } from "next";
import Link from "next/link";
import { requirePermission } from "@/lib/session";
import { pendingRequestsFor } from "@/lib/edit-requests";
import { DecideButtons } from "@/components/VisitActions";

export const metadata: Metadata = { title: "طلبات التعديل" };

const FIELD: Record<string, string> = {
  visitedOn: "التاريخ",
  lineCode: "Line Code",
  accountName: "الحساب",
  specialCase: "حالة خاصة",
  place: "المكان",
  companionIds: "المرافقين",
  tests: "الفحوصات",
  result: "النتيجة",
};

const show = (v: unknown) =>
  v === null || v === undefined || v === "" ? "—" : Array.isArray(v) ? `${v.length} مرافق` : String(v);

export default async function InboxPage() {
  const me = await requirePermission("visits:mine");
  const requests = await pendingRequestsFor(me.id);
  return (
    <>
      <div className="page-head">
        <div>
          <h1>طلبات التعديل</h1>
          <p className="muted">تعديلات اقترحها زملاءك على تقارير زياراتك. القديم يمين والجديد شمال.</p>
        </div>
      </div>
      {requests.length === 0 && <div className="card empty">ما في طلبات بانتظارك.</div>}
      <div className="grid">
        {requests.map((r) => (
          <section key={r.id} className="card card-pad grid" aria-label={`طلب على زيارة ${r.visit.number}`}>
            <div className="page-head" style={{ margin: 0 }}>
              <div>
                <h2>
                  <Link href={`/visits/${r.visit.id}`} className="ltr">
                    #{r.visit.number}
                  </Link>{" "}
                  {r.visit.accountName}
                </h2>
                <div className="small muted">
                  {r.requester.displayName}: {r.reason}
                </div>
              </div>
              <DecideButtons requestId={r.id} />
            </div>
            {Object.entries(r.changes as Record<string, { from: unknown; to: unknown }>).map(([f, c]) => (
              <div key={f}>
                <div className="small muted">{FIELD[f] ?? f}</div>
                <div className="side-by-side small">
                  <div className="diff-old">{show(c.from)}</div>
                  <div className="diff-new">{show(c.to)}</div>
                </div>
              </div>
            ))}
          </section>
        ))}
      </div>
    </>
  );
}
