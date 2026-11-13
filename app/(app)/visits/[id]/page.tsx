import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/session";
import { can, canDecideEditRequest, reportEditDecision } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { formOptions } from "@/lib/form-options";
import { formatDay } from "@/lib/dates";
import { fmtDay, RecBadge } from "@/components/visit-ui";
import { DecideButtons, DeleteVisitButton, RestoreVisitButton, StatusEditor } from "@/components/VisitActions";
import { GpsLink, MikrotikAnswers, Photos } from "@/components/FieldExtras";
import type { MikrotikAnswer } from "@/lib/mikrotik";

export const metadata: Metadata = { title: "زيارة" };

const timeFmt = new Intl.DateTimeFormat("ar-PS-u-nu-latn", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Hebron",
});

const FIELD: Record<string, string> = {
  visitedOn: "التاريخ",
  lineCode: "Line Code",
  accountName: "الحساب",
  specialCase: "حالة خاصة",
  place: "المكان",
  companions: "المرافقين",
  companionIds: "المرافقين",
  tests: "الفحوصات",
  result: "النتيجة",
  recommendation: "التوصية",
  action: "الإجراء",
  revisitDue: "موعد إعادة الزيارة",
  number: "رقم الزيارة",
};

function show(v: unknown) {
  if (v === null || v === undefined || v === "") return "—";
  if (v === true || v === "true") return "نعم";
  if (v === false || v === "false") return "لا";
  if (Array.isArray(v)) return v.length ? v.join("، ") : "—";
  return String(v);
}

export default async function VisitPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ saved?: string; warning?: string; requested?: string }>;
}) {
  const me = await requirePermission("visits:view");
  const { id } = await params;
  const sp = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const v = await prisma.visit.findUnique({
    where: { id },
    include: {
      recommendation: true,
      action: true,
      owner: { select: { displayName: true } },
      line: true,
      revisitOf: { select: { id: true, number: true } },
      revisits: { select: { id: true, number: true }, where: { deletedAt: null } },
      postponements: { include: { by: { select: { displayName: true } } }, orderBy: { createdAt: "desc" } },
      editRequests: { include: { requester: { select: { displayName: true } } }, orderBy: { createdAt: "desc" } },
    },
  });
  if (!v) notFound();
  const [options, history, companions, photos] = await Promise.all([
    formOptions(),
    prisma.auditLog.findMany({
      where: { entity: "Visit", entityId: id },
      orderBy: { id: "desc" },
      take: 200,
      include: { actor: { select: { displayName: true } } },
    }),
    prisma.user.findMany({ where: { id: { in: v.companionIds } }, select: { displayName: true } }),
    prisma.attachment.findMany({ where: { entity: "Visit", entityId: id }, select: { id: true }, orderBy: { createdAt: "asc" } }),
  ]);
  const mikrotik = (v.mikrotik as MikrotikAnswer[] | null) ?? null;
  const fromField = v.lat !== null || photos.length > 0 || (mikrotik?.length ?? 0) > 0 || v.filledAt !== null;
  const decision = reportEditDecision(me, v);
  const deleted = !!v.deletedAt;
  const pending = v.editRequests.filter((r) => r.status === "PENDING");

  return (
    <>
      <div className="page-head">
        <div>
          <h1>
            زيارة <span className="ltr">#{v.number}</span>
          </h1>
          <p className="muted">
            {fmtDay(v.visitedOn)} · {v.owner?.displayName ?? "سفير غير محدد"}
            {v.source === "LEGACY" && " · منقولة من الإكسل"}
          </p>
        </div>
        <div className="actions">
          {!deleted && decision === "allowed" && (
            <Link className="btn btn-ghost" href={`/visits/${v.id}/edit`}>
              تعديل التقرير
            </Link>
          )}
          {!deleted && decision === "request" && (
            <Link className="btn btn-ghost" href={`/visits/${v.id}/edit`}>
              طلب تعديل
            </Link>
          )}
          {!deleted && can(me, "visits:create") && v.lineCode && (
            <Link className="btn btn-ghost" href={`/visits/new?revisitOf=${v.id}`}>
              زيارة جديدة لنفس الخط
            </Link>
          )}
          {!deleted && can(me, "visits:delete") && <DeleteVisitButton visitId={v.id} number={v.number} />}
          {deleted && can(me, "visits:delete") && <RestoreVisitButton visitId={v.id} />}
        </div>
      </div>

      {sp.saved && (
        <div className="alert alert-ok" role="status" style={{ marginBottom: 16 }}>
          انحفظ.
        </div>
      )}
      {sp.requested && (
        <div className="alert alert-ok" role="status" style={{ marginBottom: 16 }}>
          انبعت طلب التعديل لصاحب الزيارة.
        </div>
      )}
      {sp.warning === "unknown-line" && (
        <div className="alert alert-warn" role="status" style={{ marginBottom: 16 }}>
          انحفظت الزيارة، بس الخط مش موجود بملف المشتركين. بتنربط لحالها لما يوصل الخط بالملف أو ينضاف يدوياً.
        </div>
      )}
      {deleted && (
        <div className="alert alert-error" style={{ marginBottom: 16 }}>
          هالزيارة محذوفة (بسلة المحذوفات).
        </div>
      )}

      <div
        className="grid"
        style={{ gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))", alignItems: "start" }}
      >
        <section className="card card-pad grid" aria-label="التقرير">
          <h2>التقرير</h2>
          <dl className="kv">
            <div>
              <dt>الخط</dt>
              <dd>
                {v.specialCase ? (
                  <span className="badge badge-warn">حالة خاصة</span>
                ) : (
                  <Link className="ltr" href={`/search?code=${encodeURIComponent(v.lineCode ?? "")}`}>
                    {v.lineCode}
                  </Link>
                )}
              </dd>
            </div>
            <div>
              <dt>{v.specialCase ? "الاسم" : "الحساب"}</dt>
              <dd>{v.accountName ?? "—"}</dd>
            </div>
            {v.place && (
              <div>
                <dt>المكان</dt>
                <dd>{v.place}</dd>
              </div>
            )}
            <div>
              <dt>المنطقة</dt>
              <dd>{v.line?.region ?? "—"}</dd>
            </div>
            <div>
              <dt>التاريخ</dt>
              <dd>
                {fmtDay(v.visitedOn)}
                {v.dateDoubtful && <span className="badge badge-warn"> تاريخ للمراجعة</span>}
              </dd>
            </div>
            <div>
              <dt>السفير</dt>
              <dd>
                {v.owner?.displayName ?? "غير محدد"}
                {companions.length > 0 && (
                  <span className="muted"> + {companions.map((c) => c.displayName).join("، ")}</span>
                )}
              </dd>
            </div>
          </dl>
          <div>
            <div className="small muted">الفحوصات اللي تمت</div>
            <p className="prose-box">{v.tests ?? "—"}</p>
          </div>
          <div>
            <div className="small muted">نتيجة الفحوصات</div>
            <p className="prose-box">{v.result ?? "—"}</p>
          </div>
          {fromField && (
            <div className="grid" style={{ gap: 10 }}>
              <dl className="kv">
                {v.filledAt && (
                  <div>
                    <dt>وقت التعبئة بالميدان</dt>
                    <dd>{timeFmt.format(v.filledAt)}</dd>
                  </div>
                )}
                <div>
                  <dt>الموقع</dt>
                  <dd>
                    <GpsLink lat={v.lat} lng={v.lng} accuracy={v.gpsAccuracy} />
                  </dd>
                </div>
              </dl>
              {mikrotik && mikrotik.length > 0 && (
                <div>
                  <div className="small muted">أسئلة المايكروتيك</div>
                  <MikrotikAnswers answers={mikrotik} />
                </div>
              )}
              {photos.length > 0 && (
                <div>
                  <div className="small muted">الصور</div>
                  <Photos ids={photos.map((p) => p.id)} />
                </div>
              )}
            </div>
          )}
          {v.revisitNote && (
            <div>
              <div className="small muted">ملاحظة إعادة الزيارة (من الإكسل)</div>
              <p className="prose-box">{v.revisitNote}</p>
            </div>
          )}
        </section>

        <div className="grid">
          <section className="card card-pad grid" aria-label="الحالة">
            <h2>الحالة</h2>
            {can(me, "visits:editStatus") && !deleted ? (
              <StatusEditor
                visitId={v.id}
                current={{
                  recommendationId: v.recommendationId,
                  actionId: v.actionId,
                  revisitDue: formatDay(v.revisitDue),
                }}
                recommendations={options.allRecommendations}
                actions={options.allActions}
              />
            ) : (
              <dl className="kv">
                <div>
                  <dt>التوصية</dt>
                  <dd>
                    <RecBadge label={v.recommendation?.label} color={v.recommendation?.color} />
                  </dd>
                </div>
                <div>
                  <dt>الإجراء</dt>
                  <dd>{v.action?.label ?? "—"}</dd>
                </div>
                {v.revisitDue && (
                  <div>
                    <dt>موعد إعادة الزيارة</dt>
                    <dd>{fmtDay(v.revisitDue)}</dd>
                  </div>
                )}
              </dl>
            )}
            {(v.revisitOf || v.revisits.length > 0) && (
              <p className="small" style={{ margin: 0 }}>
                {v.revisitOf && (
                  <>
                    إعادة زيارة لـ{" "}
                    <Link href={`/visits/${v.revisitOf.id}`} className="ltr">
                      #{v.revisitOf.number}
                    </Link>
                    .{" "}
                  </>
                )}
                {v.revisits.map((r) => (
                  <span key={r.id}>
                    انعملها إعادة زيارة:{" "}
                    <Link href={`/visits/${r.id}`} className="ltr">
                      #{r.number}
                    </Link>{" "}
                  </span>
                ))}
              </p>
            )}
            {v.postponements.length > 0 && (
              <div className="small">
                <b>اتأجلت {v.postponements.length} مرة:</b>
                <ul style={{ margin: "4px 0 0", paddingInlineStart: 18 }}>
                  {v.postponements.map((p) => (
                    <li key={p.id}>
                      {p.reason}{" "}
                      <span className="muted">
                        · {p.by.displayName} · {timeFmt.format(p.createdAt)}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>

          {pending.length > 0 && (
            <section className="card card-pad grid" aria-label="طلبات التعديل">
              <h2>طلبات تعديل بانتظار القرار</h2>
              {pending.map((r) => (
                <div key={r.id} className="grid" style={{ gap: 8 }}>
                  <div className="small">
                    <b>{r.requester.displayName}</b>: {r.reason}
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
                  {canDecideEditRequest(me, v) && <DecideButtons requestId={r.id} />}
                </div>
              ))}
            </section>
          )}
        </div>
      </div>

      <section className="card" style={{ marginTop: 16 }} aria-label="السجل">
        <div className="card-head">
          <h2>السجل</h2>
          <span className="muted small">كل تعديل على هالزيارة</span>
        </div>
        {history.length === 0 ? (
          <div className="empty">ما في تعديلات (زيارة منقولة من الإكسل).</div>
        ) : (
          <div className="table-wrap">
            <table className="table stack">
              <tbody>
                {history.map((h) => (
                  <tr key={h.id.toString()}>
                    <td className="cell-main small">{timeFmt.format(h.at)}</td>
                    <td data-label="مين">{h.actor?.displayName ?? "النظام"}</td>
                    <td data-label="شو" className="small">
                      {h.action === "CREATE"
                        ? "سجّل الزيارة"
                        : h.action === "DELETE"
                          ? "حذف"
                          : h.action === "RESTORE"
                            ? "استرجاع"
                            : null}
                      {h.field && (
                        <>
                          <b>{FIELD[h.field] ?? h.field}: </b>
                          <span className="diff-old">{show(h.oldValue)}</span> ←{" "}
                          <span className="diff-new">{show(h.newValue)}</span>
                        </>
                      )}
                      {h.note && <div className="muted">{h.note}</div>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
