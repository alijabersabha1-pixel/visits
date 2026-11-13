import type { Metadata } from "next";
import Link from "next/link";
import { requirePermission } from "@/lib/session";
import { prisma } from "@/lib/db";
import type { Prisma } from "@/lib/generated/prisma/client";

export const metadata: Metadata = { title: "سجل التعديلات" };

const PAGE_SIZE = 50;

const ACTION_LABEL: Record<string, { text: string; tone: string }> = {
  CREATE: { text: "إضافة", tone: "badge-green" },
  UPDATE: { text: "تعديل", tone: "badge-blue" },
  DELETE: { text: "حذف", tone: "badge-red" },
  RESTORE: { text: "استرجاع", tone: "badge-green" },
  LOGIN: { text: "دخول", tone: "badge-gray" },
  LOGOUT: { text: "خروج", tone: "badge-gray" },
  LOCKED: { text: "قفل مؤقت", tone: "badge-red" },
  PASSWORD_RESET: { text: "كلمة سر مؤقتة", tone: "badge-warn" },
  PASSWORD_CHANGE: { text: "تغيير كلمة السر", tone: "badge-gray" },
  SESSIONS_REVOKED: { text: "طرد من الأجهزة", tone: "badge-warn" },
  IMPORT: { text: "استيراد", tone: "badge-blue" },
};

const ENTITY_LABEL: Record<string, string> = {
  User: "مستخدم",
  Line: "خط",
  ListItem: "قائمة",
  Import: "ملف شهر",
  Visit: "زيارة",
};

const FIELD_LABEL: Record<string, string> = {
  username: "اسم الدخول",
  displayName: "الاسم",
  role: "الدور",
  active: "فعّال",
  code: "Line Code",
  accountName: "الحساب",
  speed: "السرعة",
  locality: "المكان",
  manual: "مضاف يدوياً",
  kind: "القائمة",
  label: "القيمة",
  color: "اللون",
};

const VALUE_LABEL: Record<string, string> = {
  MANAGER: "مسؤول",
  ADMIN: "مسؤول",
  AMBASSADOR: "سفير",
  true: "نعم",
  false: "لا",
};

const fmt = new Intl.DateTimeFormat("ar-PS-u-nu-latn", { dateStyle: "medium", timeStyle: "medium" });

type Search = { actor?: string; from?: string; to?: string; action?: string; page?: string };

function parseDay(v: string | undefined, endOfDay = false): Date | undefined {
  if (!v || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return undefined;
  const d = new Date(`${v}T00:00:00`);
  if (Number.isNaN(d.getTime())) return undefined;
  if (endOfDay) d.setDate(d.getDate() + 1);
  return d;
}

/** قيم الإضافة محفوظة كـ JSON: بنعرضها حقل حقل */
function createdValues(v: string | null): Array<[string, string | null]> | null {
  if (!v || !v.startsWith("{")) return null;
  try {
    return Object.entries(JSON.parse(v) as Record<string, string | null>);
  } catch {
    return null;
  }
}

function showValue(v: string | null) {
  if (v === null) return <span className="muted">—</span>;
  return VALUE_LABEL[v] ?? v;
}

export default async function AuditPage({ searchParams }: { searchParams: Promise<Search> }) {
  await requirePermission("audit:view");
  const sp = await searchParams;
  const page = Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1);

  const where: Prisma.AuditLogWhereInput = {};
  if (sp.actor === "system") where.actorId = null;
  else if (sp.actor && /^[0-9a-f-]{36}$/i.test(sp.actor)) where.actorId = sp.actor;
  if (sp.action && sp.action in ACTION_LABEL) where.action = sp.action;
  const from = parseDay(sp.from);
  const to = parseDay(sp.to, true);
  if (from || to) where.at = { ...(from && { gte: from }), ...(to && { lt: to }) };

  const [users, total, rows] = await Promise.all([
    prisma.user.findMany({ select: { id: true, displayName: true }, orderBy: { displayName: "asc" } }),
    prisma.auditLog.count({ where }),
    prisma.auditLog.findMany({
      where,
      orderBy: { id: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
  ]);
  const names = new Map(users.map((u) => [u.id, u.displayName]));
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const qs = (p: number) => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(sp)) if (v && k !== "page") q.set(k, v);
    if (p > 1) q.set("page", String(p));
    const s = q.toString();
    return s ? `?${s}` : "?";
  };

  return (
    <>
      <div className="page-head">
        <div>
          <h1>سجل التعديلات</h1>
          <p className="muted">كل إضافة أو تعديل أو حذف بالنظام، مين عمله ومتى. السجل ما بينعدّل ولا بينمسح.</p>
        </div>
      </div>

      <div className="card">
        <form className="filters form-grid" method="get">
          <div className="field">
            <label htmlFor="actor">الشخص</label>
            <select id="actor" name="actor" className="select" defaultValue={sp.actor ?? ""}>
              <option value="">الكل</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.displayName}
                </option>
              ))}
              <option value="system">النظام</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="action">العملية</label>
            <select id="action" name="action" className="select" defaultValue={sp.action ?? ""}>
              <option value="">الكل</option>
              {Object.entries(ACTION_LABEL).map(([k, v]) => (
                <option key={k} value={k}>
                  {v.text}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="from">من تاريخ</label>
            <input id="from" name="from" type="date" className="input" defaultValue={sp.from ?? ""} />
          </div>
          <div className="field">
            <label htmlFor="to">لتاريخ</label>
            <input id="to" name="to" type="date" className="input" defaultValue={sp.to ?? ""} />
          </div>
          <div className="actions">
            <button className="btn btn-primary" type="submit">
              عرض
            </button>
            <Link className="btn btn-ghost" href="/admin/audit">
              مسح
            </Link>
          </div>
        </form>

        {rows.length === 0 ? (
          <div className="empty">ما في عمليات بهالفلتر.</div>
        ) : (
          <div className="table-wrap">
            <table className="table stack">
              <thead>
                <tr>
                  <th>الوقت</th>
                  <th>الشخص</th>
                  <th>العملية</th>
                  <th>على</th>
                  <th>التغيير</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const action = ACTION_LABEL[r.action] ?? { text: r.action, tone: "badge-gray" };
                  const target =
                    r.entity === "User"
                      ? (names.get(r.entityId) ?? r.entityId)
                      : `${ENTITY_LABEL[r.entity] ?? r.entity} ${r.entityId}`;
                  return (
                    <tr key={r.id.toString()}>
                      <td className="cell-main small">{fmt.format(r.at)}</td>
                      <td data-label="الشخص">
                        {r.actorId ? (names.get(r.actorId) ?? "؟") : <span className="muted">النظام</span>}
                      </td>
                      <td data-label="العملية">
                        <span className={`badge ${action.tone}`}>{action.text}</span>
                      </td>
                      <td data-label="على">
                        <span className="muted small">{ENTITY_LABEL[r.entity] ?? r.entity}: </span>
                        {target}
                      </td>
                      <td data-label="التغيير" className="small">
                        {r.action === "CREATE" &&
                          createdValues(r.newValue)?.map(([k, v]) => (
                            <div key={k}>
                              <b>{FIELD_LABEL[k] ?? k}: </b>
                              <span className="diff-new">{showValue(v)}</span>
                            </div>
                          ))}
                        {r.field && (
                          <div>
                            <b>{FIELD_LABEL[r.field] ?? r.field}: </b>
                            {r.action === "UPDATE" && (
                              <>
                                <span className="diff-old">{showValue(r.oldValue)}</span> ←{" "}
                              </>
                            )}
                            <span className="diff-new">{showValue(r.newValue)}</span>
                          </div>
                        )}
                        {r.note && <div className="muted">{r.note}</div>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <div className="pager small">
          <span className="muted">
            {total} عملية · صفحة {page} من {pages}
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
      </div>
    </>
  );
}
