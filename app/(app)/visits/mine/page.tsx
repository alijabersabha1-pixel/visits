import type { Metadata } from "next";
import Link from "next/link";
import { requirePermission } from "@/lib/session";
import { listVisits } from "@/lib/visit-list";
import { formOptions } from "@/lib/form-options";
import { Pager, toFilters, VisitFiltersForm, VisitTable, type FilterValues } from "@/components/visit-ui";

export const metadata: Metadata = { title: "زياراتي" };

export default async function MyVisitsPage({
  searchParams,
}: {
  searchParams: Promise<FilterValues & { page?: string }>;
}) {
  const me = await requirePermission("visits:mine");
  const sp = await searchParams;
  const [options, result] = await Promise.all([
    formOptions(),
    listVisits({ ...toFilters(sp), ownerId: me.id }, { page: Number(sp.page) || 1 }),
  ]);
  return (
    <>
      <div className="page-head">
        <div>
          <h1>زياراتي</h1>
          <p className="muted">الزيارات اللي سجلتها أنت.</p>
        </div>
        <Link className="btn btn-primary" href="/visits/new">
          زيارة جديدة
        </Link>
      </div>
      <div className="card">
        <VisitFiltersForm values={sp} options={options} showOwner={false} />
        <VisitTable rows={result.rows} empty="لسا ما سجلت زيارات بهالفلتر." />
        <Pager page={result.page} pages={result.pages} total={result.total} values={sp} />
      </div>
    </>
  );
}
