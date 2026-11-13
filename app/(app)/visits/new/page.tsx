import type { Metadata } from "next";
import { requirePermission } from "@/lib/session";
import { formOptions } from "@/lib/form-options";
import { todayLocal } from "@/lib/dates";
import { prisma } from "@/lib/db";
import { VisitForm } from "@/components/VisitForm";

export const metadata: Metadata = { title: "زيارة جديدة" };

export default async function NewVisitPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string; revisitOf?: string }>;
}) {
  const me = await requirePermission("visits:create");
  const sp = await searchParams;
  const options = await formOptions();
  const original =
    sp.revisitOf && /^[0-9a-f-]{36}$/i.test(sp.revisitOf)
      ? await prisma.visit.findUnique({ where: { id: sp.revisitOf } })
      : null;
  const today = todayLocal();
  return (
    <>
      <div className="page-head">
        <div>
          <h1>زيارة جديدة</h1>
          {original && (
            <p className="muted">
              إعادة زيارة للزيارة رقم <b className="ltr">#{original.number}</b>
            </p>
          )}
        </div>
      </div>
      <div style={{ maxWidth: 820 }}>
        <VisitForm
          mode="create"
          today={today}
          meId={me.id}
          revisitOfId={original?.id}
          recommendations={options.recommendations}
          actions={options.actions}
          ambassadors={options.ambassadors}
          initial={{
            visitedOn: today,
            lineCode: original?.lineCode ?? sp.code ?? "",
            specialCase: original?.specialCase ?? false,
            accountName: original?.accountName ?? "",
            place: original?.place ?? "",
            companionIds: [],
            tests: "",
            result: "",
          }}
        />
      </div>
    </>
  );
}
