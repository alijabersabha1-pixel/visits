import type { Metadata } from "next";
import Link from "next/link";
import { requirePermission } from "@/lib/session";
import { can } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { normalizeLineCode } from "@/lib/line-code";
import type { Prisma } from "@/lib/generated/prisma/client";
import { ManualLineForm } from "./ManualLineForm";

export const metadata: Metadata = { title: "خطوط المشتركين" };

const PAGE_SIZE = 50;

type Search = { q?: string; filter?: string; page?: string };

export default async function LinesPage({ searchParams }: { searchParams: Promise<Search> }) {
  const me = await requirePermission("visits:view");
  const sp = await searchParams;
  const page = Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1);
  const q = (sp.q ?? "").trim().slice(0, 100);

  const where: Prisma.LineWhereInput = {};
  if (q) {
    const key = normalizeLineCode(q);
    where.OR = [
      ...(key ? [{ codeKey: { contains: key } }] : []),
      { accountName: { contains: q, mode: "insensitive" } },
    ];
  }
  if (sp.filter === "manual") where.manual = true;
  if (sp.filter === "missing") where.inLatestFile = false;
  if (sp.filter === "noregion") where.region = null;

  const [total, all, manual, missing, noRegion, rows, lastImport] = await Promise.all([
    prisma.line.count({ where }),
    prisma.line.count(),
    prisma.line.count({ where: { manual: true } }),
    prisma.line.count({ where: { inLatestFile: false } }),
    prisma.line.count({ where: { region: null } }),
    prisma.line.findMany({
      where,
      orderBy: [{ region: "asc" }, { codeKey: "asc" }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.import.findFirst({ orderBy: { createdAt: "desc" } }),
  ]);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const qs = (p: number, f = sp.filter) => {
    const u = new URLSearchParams();
    if (q) u.set("q", q);
    if (f) u.set("filter", f);
    if (p > 1) u.set("page", String(p));
    const s = u.toString();
    return s ? `?${s}` : "?";
  };
  const canAdd = can(me, "subscribers:import");

  const chips: Array<[string | undefined, string, number]> = [
    [undefined, "الكل", all],
    ["manual", "مضاف يدوياً", manual],
    ["missing", "مش موجود بآخر ملف", missing],
    ["noregion", "بدون منطقة", noRegion],
  ];

  return (
    <>
      <div className="page-head">
        <div>
          <h1>خطوط المشتركين</h1>
          <p className="muted">
            الخطوط بتيجي من ملف الشهر{lastImport ? ` (آخر ملف: ${lastImport.month})` : ""}. الخط الطارئ اللي بيوصل قبل
            الملف الجاي بينضاف يدوياً.
          </p>
        </div>
        {canAdd && (
          <Link className="btn btn-ghost" href="/admin/import">
            استيراد ملف الشهر
          </Link>
        )}
      </div>

      {canAdd && <ManualLineForm />}

      <div className="card">
        <form className="filters form-grid" method="get">
          <div className="field">
            <label htmlFor="q">بحث بالكود أو اسم الحساب</label>
            <input id="q" name="q" className="input" defaultValue={q} placeholder="G-7872-002" />
          </div>
          {sp.filter && <input type="hidden" name="filter" value={sp.filter} />}
          <div className="actions">
            <button className="btn btn-primary" type="submit">
              بحث
            </button>
          </div>
        </form>
        <div className="filters actions" style={{ paddingTop: 10, paddingBottom: 10 }}>
          {chips.map(([f, label, n]) => (
            <Link key={label} href={qs(1, f)} className={`btn btn-sm ${sp.filter === f ? "btn-primary" : "btn-ghost"}`}>
              {label} <span className="ltr">({n})</span>
            </Link>
          ))}
        </div>

        {rows.length === 0 ? (
          <div className="empty">
            {all === 0 ? "لسا ما في خطوط. استورد ملف الشهر أو ضيف خط طارئ." : "ما في خطوط بهالبحث."}
          </div>
        ) : (
          <div className="table-wrap">
            <table className="table stack">
              <thead>
                <tr>
                  <th>Line Code</th>
                  <th>الحساب</th>
                  <th>المنطقة</th>
                  <th>السرعة</th>
                  <th>مدير الحساب</th>
                  <th>ملاحظة</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((l) => (
                  <tr key={l.id}>
                    <td className="cell-main">
                      <b className="ltr">{l.code}</b>
                    </td>
                    <td data-label="الحساب">{l.accountName ?? "—"}</td>
                    <td data-label="المنطقة">
                      {l.region ?? (
                        <span className="badge badge-warn">
                          {l.locality ? `مش معروفة (${l.locality})` : "مش معروفة"}
                        </span>
                      )}
                    </td>
                    <td data-label="السرعة" className="small">
                      {l.speed ?? "—"}
                    </td>
                    <td data-label="مدير الحساب" className="small ltr">
                      {l.accountManager ?? "—"}
                    </td>
                    <td data-label="ملاحظة">
                      <span className="actions">
                        {l.manual && <span className="badge badge-blue">مضاف يدوياً</span>}
                        {!l.inLatestFile && <span className="badge badge-gray">مش موجود بآخر ملف</span>}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="pager small">
          <span className="muted">
            {total} خط · صفحة {page} من {pages}
          </span>
          <span className="actions">
            {page > 1 && (
              <Link className="btn btn-ghost btn-sm" href={qs(page - 1)}>
                السابق
              </Link>
            )}
            {page < pages && (
              <Link className="btn btn-ghost btn-sm" href={qs(page + 1)}>
                التالي
              </Link>
            )}
          </span>
        </div>
      </div>
    </>
  );
}
