import type { Metadata } from "next";
import { requirePermission } from "@/lib/session";
import { can } from "@/lib/authz";
import { LIST_KINDS, LIST_LABEL, listItems } from "@/lib/lists";
import { ListEditor } from "./ListEditor";
import { QuestionsEditor } from "./QuestionsEditor";
import { prisma } from "@/lib/db";

export const metadata: Metadata = { title: "القوائم" };

export default async function ListsPage() {
  const me = await requirePermission("visits:view");
  const canManage = can(me, "lists:manage");
  const lists = await Promise.all(
    LIST_KINDS.map(async (kind) => ({
      kind,
      title: LIST_LABEL[kind],
      items: (await listItems(kind, { includeInactive: true })).map(({ id, label, active, color }) => ({
        id,
        label,
        active,
        color,
      })),
    })),
  );
  const questions = await prisma.mikrotikQuestion.findMany({
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    select: { id: true, text: true, options: true, active: true, sortOrder: true, role: true },
  });
  return (
    <>
      <div className="page-head">
        <div>
          <h1>القوائم</h1>
          <p className="muted">
            خيارات التوصية والإجراء وأسئلة المايكروتيك بنموذج الزيارة. القيمة الموقوفة بتختفي من الزيارات الجديدة، وبتضل ظاهرة بالزيارات
            القديمة.
          </p>
        </div>
        {!canManage && <span className="badge badge-gray">للاطلاع فقط</span>}
      </div>
      <div
        className="grid"
        style={{ gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", alignItems: "start" }}
      >
        {lists.map((l) => (
          <ListEditor key={l.kind} kind={l.kind} title={l.title} items={l.items} canManage={canManage} />
        ))}
        <QuestionsEditor questions={questions} canManage={canManage} />
      </div>
    </>
  );
}
