import { beforeEach, describe, expect, it } from "vitest";
import {
  createMikrotikQuestion,
  mikrotikQuestions,
  updateMikrotikQuestion,
  validateAnswers,
} from "@/lib/mikrotik";
import type { Actor } from "@/lib/authz";
import { prisma, resetDb, makeUser } from "./helpers";

async function actors() {
  const amb = await makeUser("amb", "AMBASSADOR");
  const mgr = await makeUser("mgr", "MANAGER");
  const asActor = (u: { id: string; role: string }): Actor => ({ id: u.id, role: u.role as Actor["role"], active: true });
  return { amb: asActor(amb), mgr: asActor(mgr) };
}

describe("إدارة أسئلة المايكروتيك (المهمة 18)", () => {
  beforeEach(resetDb);

  it("الأسئلة الابتدائية من المواصفات موجودة بالترتيب", async () => {
    const qs = await mikrotikQuestions();
    expect(qs.map((q) => q.text)).toEqual([
      "كم جهاز مايكروتيك عند المشترك؟",
      "هل اشترى المايكروتيك من طرفه؟",
      "البرمجة من طرف مين؟",
      "هل عند الشركة access على المايكروتيك؟",
      "(لو لا) تم إنشاء يوزر للشركة؟",
    ]);
  });

  it("سؤال بيضيفه السفير بيظهر بالنموذج مباشرة، وبينسجل بالسجل", async () => {
    const { amb } = await actors();
    const q = await createMikrotikQuestion(amb, { text: "  نوع الجهاز؟ ", options: ["hAP", " RB4011 ", "hAP"] });
    expect(q.text).toBe("نوع الجهاز؟");
    expect(q.options).toEqual(["hAP", "RB4011"]);
    const qs = await mikrotikQuestions();
    expect(qs.at(-1)?.id).toBe(q.id);
    expect(await validateAnswers([{ questionId: q.id, answer: "RB4011" }])).toEqual([
      { questionId: q.id, question: "نوع الجهاز؟", answer: "RB4011" },
    ]);
    expect(await prisma.auditLog.count({ where: { entity: "MikrotikQuestion", entityId: q.id, action: "CREATE" } })).toBe(1);
  });

  it("السؤال الموقوف بيختفي من النموذج، وإجاباته القديمة بتضل محفوظة بنصها", async () => {
    const { amb } = await actors();
    const [first] = await mikrotikQuestions();
    await updateMikrotikQuestion(amb, first.id, { active: false });
    expect((await mikrotikQuestions()).some((q) => q.id === first.id)).toBe(false);
    const log = await prisma.auditLog.findFirstOrThrow({ where: { entityId: first.id, field: "active" } });
    expect([log.oldValue, log.newValue]).toEqual(["true", "false"]);
  });

  it("تعديل النص والخيارات والترتيب", async () => {
    const { amb } = await actors();
    const qs = await mikrotikQuestions();
    const last = qs.at(-1)!;
    await updateMikrotikQuestion(amb, last.id, { text: "تم إنشاء يوزر للشركة؟", options: ["نعم", "لسا", "رفض"], sortOrder: 0 });
    const after = await mikrotikQuestions();
    expect(after[0].text).toBe("تم إنشاء يوزر للشركة؟");
    expect(after[0].options).toEqual(["نعم", "لسا", "رفض"]);
  });

  it("بيانات ناقصة بتنرفض", async () => {
    const { amb } = await actors();
    await expect(createMikrotikQuestion(amb, { text: "", options: ["أ", "ب"] })).rejects.toThrow();
    await expect(createMikrotikQuestion(amb, { text: "سؤال؟", options: ["وحيد"] })).rejects.toThrow();
  });

  it("المسؤول ما بيعدّل الأسئلة (403)", async () => {
    const { mgr } = await actors();
    const [first] = await mikrotikQuestions();
    await expect(createMikrotikQuestion(mgr, { text: "سؤال؟", options: ["أ", "ب"] })).rejects.toMatchObject({ status: 403 });
    await expect(updateMikrotikQuestion(mgr, first.id, { active: false })).rejects.toMatchObject({ status: 403 });
  });
});
