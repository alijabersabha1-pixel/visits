/** قطع مشتركة لعرض الزيارات (بتشتغل على السيرفر) */
import Link from "next/link";
import { REGIONS } from "@/lib/line-code";
import type { FormOptions } from "@/lib/form-options";

const dayFmt = new Intl.DateTimeFormat("ar-PS-u-nu-latn", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

export function fmtDay(d: Date | null | undefined) {
  return d ? dayFmt.format(d) : "—";
}

export function RecBadge({ label, color }: { label?: string | null; color?: string | null }) {
  if (!label) return <span className="muted">—</span>;
  return (
    <span className="badge badge-gray" style={color ? { background: `${color}1a`, color } : undefined}>
      {label}
    </span>
  );
}

export interface VisitRow {
  id: string;
  number: number;
  visitedOn: Date | null;
  lineCode: string | null;
  accountName: string | null;
  specialCase: boolean;
  source: "LEGACY" | "APP";
  recommendation: { label: string; color: string | null } | null;
  action: { label: string } | null;
  owner: { displayName: string } | null;
  line?: { region: string | null } | null;
}

export function VisitTable({
  rows,
  empty = "ما في زيارات بهالفلتر.",
  showRegion = true,
  selectForm,
}: {
  rows: VisitRow[];
  empty?: string;
  showRegion?: boolean;
  /** لو موجود: مربع اختيار لكل زيارة تابع لنموذج التصدير بهالاسم */
  selectForm?: string;
}) {
  if (!rows.length) return <div className="empty">{empty}</div>;
  return (
    <div className="table-wrap">
      <table className="table stack">
        <thead>
          <tr>
            {selectForm && (
              <th style={{ width: 36 }}>
                <span className="sr-only">اختيار</span>
              </th>
            )}
            <th>رقم</th>
            <th>التاريخ</th>
            <th>الخط</th>
            {showRegion && <th>المنطقة</th>}
            <th>السفير</th>
            <th>التوصية</th>
            <th>الإجراء</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((v) => (
            <tr key={v.id} data-visit={v.number}>
              {selectForm && (
                <td className="cell-select">
                  <input
                    type="checkbox"
                    name="ids"
                    value={v.id}
                    form={selectForm}
                    aria-label={`اختيار الزيارة ${v.number}`}
                  />
                </td>
              )}
              <td className="cell-main">
                <Link href={`/visits/${v.id}`}>
                  <b className="ltr">#{v.number}</b>
                </Link>{" "}
                <span className="muted small">{v.accountName ?? ""}</span>
              </td>
              <td data-label="التاريخ" className="small">
                {fmtDay(v.visitedOn)}
              </td>
              <td data-label="الخط">
                {v.specialCase ? (
                  <span className="badge badge-warn">حالة خاصة</span>
                ) : (
                  <span className="ltr">{v.lineCode}</span>
                )}
              </td>
              {showRegion && (
                <td data-label="المنطقة" className="small">
                  {v.line?.region ?? "—"}
                </td>
              )}
              <td data-label="السفير" className="small">
                {v.owner?.displayName ?? <span className="muted">غير محدد</span>}
              </td>
              <td data-label="التوصية">
                <RecBadge label={v.recommendation?.label} color={v.recommendation?.color} />
              </td>
              <td data-label="الإجراء" className="small">
                {v.action?.label ?? "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export type FilterValues = Partial<
  Record<"from" | "to" | "owner" | "region" | "rec" | "action" | "special" | "q", string>
>;

export function VisitFiltersForm({
  values,
  options,
  showOwner = true,
}: {
  values: FilterValues;
  options: FormOptions;
  showOwner?: boolean;
}) {
  const more = Object.entries(values).some(([k, v]) => v && k !== "q" && k !== "page");
  return (
    <form className="filters grid" method="get" style={{ gap: 12 }}>
      <div className="actions" style={{ flexWrap: "nowrap" }}>
        <label className="sr-only" htmlFor="f-q">
          بحث
        </label>
        <input id="f-q" name="q" className="input" defaultValue={values.q} placeholder="بحث: كود، حساب، أو رقم زيارة" />
        <button className="btn btn-primary" type="submit">
          عرض
        </button>
      </div>
      <details open={more}>
        <summary className="small" style={{ cursor: "pointer", fontWeight: 600, color: "var(--blue)" }}>
          فلاتر أكتر
        </summary>
        <div className="form-grid" style={{ marginTop: 12 }}>
          <div className="field">
            <label htmlFor="f-from">من تاريخ</label>
            <input id="f-from" name="from" type="date" className="input" defaultValue={values.from} />
          </div>
          <div className="field">
            <label htmlFor="f-to">لتاريخ</label>
            <input id="f-to" name="to" type="date" className="input" defaultValue={values.to} />
          </div>
          {showOwner && (
            <div className="field">
              <label htmlFor="f-owner">السفير</label>
              <select id="f-owner" name="owner" className="select" defaultValue={values.owner ?? ""}>
                <option value="">الكل</option>
                {options.users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.displayName}
                  </option>
                ))}
                <option value="none">غير محدد (قديمة)</option>
              </select>
            </div>
          )}
          <div className="field">
            <label htmlFor="f-region">المنطقة</label>
            <select id="f-region" name="region" className="select" defaultValue={values.region ?? ""}>
              <option value="">الكل</option>
              {REGIONS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
              <option value="none">بدون منطقة</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="f-rec">التوصية</label>
            <select id="f-rec" name="rec" className="select" defaultValue={values.rec ?? ""}>
              <option value="">الكل</option>
              {options.allRecommendations.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.label}
                  {r.active ? "" : " (قديمة)"}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="f-action">الإجراء</label>
            <select id="f-action" name="action" className="select" defaultValue={values.action ?? ""}>
              <option value="">الكل</option>
              <option value="none">بدون إجراء</option>
              {options.allActions.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.label}
                  {r.active ? "" : " (قديمة)"}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="f-special">النوع</label>
            <select id="f-special" name="special" className="select" defaultValue={values.special ?? ""}>
              <option value="">الكل</option>
              <option value="1">حالات خاصة بس</option>
              <option value="0">بـ Line Code بس</option>
            </select>
          </div>
          <div className="actions">
            <button className="btn btn-primary" type="submit">
              عرض
            </button>
            <a className="btn btn-ghost" href="?">
              مسح
            </a>
          </div>
        </div>
      </details>
    </form>
  );
}

export function Pager({
  page,
  pages,
  total,
  values,
}: {
  page: number;
  pages: number;
  total: number;
  values: Record<string, string | undefined>;
}) {
  const qs = (p: number) => {
    const u = new URLSearchParams();
    for (const [k, v] of Object.entries(values)) if (v && k !== "page") u.set(k, v);
    if (p > 1) u.set("page", String(p));
    const s = u.toString();
    return s ? `?${s}` : "?";
  };
  return (
    <div className="pager small">
      <span className="muted">
        {total} زيارة · صفحة {page} من {pages}
      </span>
      <span className="actions">
        {page > 1 && (
          <Link className="btn btn-ghost btn-sm" href={qs(page - 1)}>
            الأحدث
          </Link>
        )}
        {page < pages && (
          <Link className="btn btn-ghost btn-sm" href={qs(page + 1)}>
            الأقدم
          </Link>
        )}
      </span>
    </div>
  );
}

/** searchParams ← فلاتر lib/visit-list */
export function toFilters(v: FilterValues) {
  return {
    q: v.q,
    from: v.from,
    to: v.to,
    ownerId: v.owner,
    region: v.region,
    recommendationId: v.rec,
    actionId: v.action,
    special: v.special === "1" ? true : v.special === "0" ? false : undefined,
  };
}
