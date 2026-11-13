import type { Metadata } from "next";
import Link from "next/link";
import { requirePermission } from "@/lib/session";
import { can } from "@/lib/authz";
import { listVisits } from "@/lib/visit-list";
import { formOptions } from "@/lib/form-options";
import { Pager, toFilters, VisitFiltersForm, VisitTable, type FilterValues } from "@/components/visit-ui";
import { ExportBar, EXPORT_FORM } from "@/components/ExportBar";

export const metadata: Metadata = { title: "الزيارات" };

export default async function VisitsPage({
  searchParams,
}: {
  searchParams: Promise<FilterValues & { page?: string; deleted?: string }>;
}) {
  const me = await requirePermission("visits:view");
  const sp = await searchParams;
  const [options, result] = await Promise.all([
    formOptions(),
    listVisits(toFilters(sp), { page: Number(sp.page) || 1 }),
  ]);
  return (
    <>
      <div className="page-head">
        <div>
          <h1>الزيارات</h1>
          <p className="muted">كل الزيارات، القديمة من الإكسل والجديدة. الضغط على رقم الزيارة بيفتح تقريرها.</p>
        </div>
        {can(me, "visits:create") && (
          <Link className="btn btn-primary" href="/visits/new">
            زيارة جديدة
          </Link>
        )}
      </div>
      {sp.deleted && (
        <div className="alert alert-ok" role="status" style={{ marginBottom: 16 }}>
          انحذفت الزيارة وانتقلت لسلة المحذوفات.
        </div>
      )}
      <div className="card">
        <VisitFiltersForm values={sp} options={options} />
        {can(me, "export") && result.total > 0 && <ExportBar values={sp} total={result.total} />}
        <VisitTable rows={result.rows} selectForm={can(me, "export") ? EXPORT_FORM : undefined} />
        <Pager page={result.page} pages={result.pages} total={result.total} values={sp} />
      </div>
    </>
  );
}
