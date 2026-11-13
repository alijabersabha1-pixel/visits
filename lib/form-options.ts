import "server-only";
import { prisma } from "./db";
import { listItems } from "./lists";

/** خيارات نموذج الزيارة والفلاتر */
export async function formOptions() {
  const [recommendations, actions, allRecs, allActions, ambassadors, users] = await Promise.all([
    listItems("RECOMMENDATION"),
    listItems("ACTION"),
    listItems("RECOMMENDATION", { includeInactive: true }),
    listItems("ACTION", { includeInactive: true }),
    prisma.user.findMany({
      where: { role: "AMBASSADOR", active: true },
      select: { id: true, displayName: true },
      orderBy: { displayName: "asc" },
    }),
    prisma.user.findMany({
      where: { role: "AMBASSADOR" },
      select: { id: true, displayName: true },
      orderBy: { displayName: "asc" },
    }),
  ]);
  const pick = (l: { id: string; label: string; color: string | null; active: boolean }[]) =>
    l.map(({ id, label, color, active }) => ({ id, label, color, active }));
  return {
    recommendations: pick(recommendations),
    actions: pick(actions),
    allRecommendations: pick(allRecs),
    allActions: pick(allActions),
    ambassadors,
    users,
  };
}
export type FormOptions = Awaited<ReturnType<typeof formOptions>>;
