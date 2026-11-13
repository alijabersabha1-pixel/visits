import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { requirePermission } from "@/lib/session";
import { reportEditDecision } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { formOptions } from "@/lib/form-options";
import { formatDay, todayLocal } from "@/lib/dates";
import { VisitForm } from "@/components/VisitForm";

export const metadata: Metadata = { title: "تعديل التقرير" };

export default async function EditVisitPage({ params }: { params: Promise<{ id: string }> }) {
  const me = await requirePermission("visits:view");
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const v = await prisma.visit.findUnique({ where: { id } });
  if (!v || v.deletedAt) notFound();
  const decision = reportEditDecision(me, v);
  if (decision === "denied") redirect(`/visits/${id}`);
  const options = await formOptions();
  return (
    <>
      <div className="page-head">
        <h1>
          {decision === "allowed" ? "تعديل التقرير" : "طلب تعديل"} · <span className="ltr">#{v.number}</span>
        </h1>
      </div>
      <div style={{ maxWidth: 820 }}>
        <VisitForm
          mode={decision === "allowed" ? "edit" : "request"}
          visitId={v.id}
          today={todayLocal()}
          meId={v.ownerId ?? me.id}
          ambassadors={options.ambassadors}
          initial={{
            visitedOn: formatDay(v.visitedOn),
            lineCode: v.lineCode ?? "",
            specialCase: v.specialCase,
            accountName: v.accountName ?? "",
            place: v.place ?? "",
            companionIds: v.companionIds,
            tests: v.tests ?? "",
            result: v.result ?? "",
          }}
        />
      </div>
    </>
  );
}
