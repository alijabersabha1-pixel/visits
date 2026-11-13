/**
 * أزرار التصدير بصفحة الزيارات. نموذج GET عادي: لو في زيارات محددة بتنبعت (ids)،
 * وإلا بينصدّر كل نتيجة الفلتر. المتصفح بينزّل الملف مباشرة.
 */
import type { FilterValues } from "./visit-ui";

export const EXPORT_FORM = "export-form";

export function ExportBar({ values, total }: { values: FilterValues; total: number }) {
  return (
    <form id={EXPORT_FORM} className="export-bar" method="get" action="/api/export/visits">
      {Object.entries(values).map(([k, v]) =>
        v && ["q", "from", "to", "owner", "region", "rec", "action", "special"].includes(k) ? (
          <input key={k} type="hidden" name={k} value={v} />
        ) : null,
      )}
      <span className="small muted">
        تصدير الزيارات المحددة، أو كل النتيجة ({total}) لو ما حددت شي:
      </span>
      <span className="actions">
        <button className="btn btn-ghost btn-sm" name="format" value="xlsx">
          Excel
        </button>
        <button className="btn btn-ghost btn-sm" name="format" value="pdf">
          PDF جدول
        </button>
        <button className="btn btn-ghost btn-sm" name="format" value="pdf-full">
          PDF مفصّل
        </button>
      </span>
    </form>
  );
}
