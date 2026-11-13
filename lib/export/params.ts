/** قراءة اختيار التصدير من الرابط: زيارات محددة (ids) أو فلاتر صفحة الزيارات */
import { toFilters, type FilterValues } from "@/components/visit-ui";

export const MAX_SELECTED = 300;
const UUID = /^[0-9a-f-]{36}$/i;

export function selectionFrom(sp: URLSearchParams | Record<string, string | string[] | undefined>) {
  const get = (k: string): string | undefined => {
    if (sp instanceof URLSearchParams) return sp.get(k) ?? undefined;
    const v = sp[k];
    return Array.isArray(v) ? v[0] : v;
  };
  const all = (k: string): string[] => {
    if (sp instanceof URLSearchParams) return sp.getAll(k);
    const v = sp[k];
    return v === undefined ? [] : Array.isArray(v) ? v : [v];
  };
  const ids = all("ids")
    .flatMap((s) => s.split(","))
    .filter((s) => UUID.test(s))
    .slice(0, MAX_SELECTED);
  const values: FilterValues = {
    q: get("q"),
    from: get("from"),
    to: get("to"),
    owner: get("owner"),
    region: get("region"),
    rec: get("rec"),
    action: get("action"),
    special: get("special"),
  };
  return { ids: ids.length ? ids : undefined, filters: toFilters(values), mode: get("mode") === "full" ? "full" : "table" } as const;
}

/** نفس الاختيار كرابط لصفحة الطباعة */
export function selectionQuery(sp: URLSearchParams): string {
  const q = new URLSearchParams();
  for (const k of ["q", "from", "to", "owner", "region", "rec", "action", "special", "mode"]) {
    const v = sp.get(k);
    if (v) q.set(k, v);
  }
  const ids = sp.getAll("ids").flatMap((s) => s.split(",")).filter((s) => UUID.test(s)).slice(0, MAX_SELECTED);
  if (ids.length) q.set("ids", ids.join(","));
  return q.toString();
}
