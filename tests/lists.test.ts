import { beforeEach, describe, expect, it } from "vitest";
import { addListItem, listItems, moveListItem, setListItemActive } from "@/lib/lists";
import { prisma, resetDb, makeUser } from "./helpers";

describe("القوائم", () => {
  beforeEach(resetDb);

  it("القوائم الابتدائية موجودة متل المواصفات", async () => {
    const recs = await listItems("RECOMMENDATION");
    expect(recs.map((r) => r.label)).toEqual([
      "يوجد تجاوز",
      "لا يوجد تجاوز",
      "إعادة زيارة",
      "زيارة غير ناجحة",
      "فحص شبكة",
    ]);
    const all = await listItems("RECOMMENDATION", { includeInactive: true });
    expect(all.filter((r) => !r.active).map((r) => r.label)).toEqual(["مفصول سابقاً بسبب التجاوز", "تأجيل الزيارة"]);
    const actions = await listItems("ACTION");
    expect(actions).toHaveLength(8);
    expect(actions[0].label).toBe("تم تصويب الوضع");
  });

  it("إضافة قيمة بتصير آخر وحدة، والمكرر بينرفض", async () => {
    const amb = await makeUser("amb");
    const item = await addListItem(amb.id, { kind: "ACTION", label: "  تم التبليغ  " });
    expect(item.label).toBe("تم التبليغ");
    const actions = await listItems("ACTION");
    expect(actions.at(-1)?.label).toBe("تم التبليغ");
    await expect(addListItem(amb.id, { kind: "ACTION", label: "تم التبليغ" })).rejects.toThrow("موجودة");
    expect(await prisma.auditLog.count({ where: { entity: "ListItem", entityId: item.id, action: "CREATE" } })).toBe(1);
  });

  it("الإيقاف بيخفيها من الاختيار وبتضل موجودة، والإرجاع بيرجعها", async () => {
    const amb = await makeUser("amb");
    const [first] = await listItems("RECOMMENDATION");
    await setListItemActive(amb.id, first.id, false);
    expect((await listItems("RECOMMENDATION")).map((r) => r.id)).not.toContain(first.id);
    expect((await listItems("RECOMMENDATION", { includeInactive: true })).map((r) => r.id)).toContain(first.id);
    await setListItemActive(amb.id, first.id, true);
    expect((await listItems("RECOMMENDATION")).map((r) => r.id)).toContain(first.id);
    const logs = await prisma.auditLog.findMany({ where: { entityId: first.id, action: "UPDATE" } });
    expect(logs.map((l) => [l.field, l.oldValue, l.newValue])).toEqual([
      ["active", "true", "false"],
      ["active", "false", "true"],
    ]);
  });

  it("الترتيب: تحريك لفوق ولتحت، وعلى الأطراف ما بيصير شي", async () => {
    const amb = await makeUser("amb");
    const before = await listItems("RECOMMENDATION");
    await moveListItem(amb.id, before[1].id, "up");
    let after = await listItems("RECOMMENDATION");
    expect(after.slice(0, 2).map((r) => r.label)).toEqual([before[1].label, before[0].label]);
    await moveListItem(amb.id, after[0].id, "up"); // أول وحدة
    expect((await listItems("RECOMMENDATION")).map((r) => r.id)).toEqual(after.map((r) => r.id));
    await moveListItem(amb.id, after[0].id, "down");
    after = await listItems("RECOMMENDATION");
    expect(after.map((r) => r.id)).toEqual(before.map((r) => r.id));
  });
});
