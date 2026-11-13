import { beforeEach, describe, expect, it } from "vitest";
import { mapData } from "@/lib/map";
import { createVisit } from "@/lib/visits";
import { createVpnCase } from "@/lib/vpn";
import { prisma, resetDb, sessionActor, listId } from "./helpers";

type Actor = Awaited<ReturnType<typeof sessionActor>>;

async function setup() {
  const ali = await sessionActor("ali");
  const sami = await sessionActor("sami");
  const rec = {
    violation: await listId("RECOMMENDATION", "يوجد تجاوز"),
    fine: await listId("RECOMMENDATION", "لا يوجد تجاوز"),
    revisit: await listId("RECOMMENDATION", "إعادة زيارة"),
  };
  await prisma.line.createMany({
    data: [
      { codeKey: "G1111001", code: "G-1111-001", accountKey: "G1111", accountName: "محل غزة", region: "غزة", speed: "8M" },
      { codeKey: "G2222001", code: "G-2222-001", accountName: "محل الوسطى", accountKey: "G2222", region: "الوسطى" },
      { codeKey: "G3333001", code: "G-3333-001", accountName: "محل الجنوب", accountKey: "G3333", region: "الجنوب" },
    ],
  });
  const at = (lat: number, lng: number) => ({ gps: { lat, lng, accuracy: 10 } });
  const visit = (actor: Actor, day: string, code: string, recommendationId: string, extra = {}) =>
    createVisit(actor, { visitedOn: day, lineCode: code, recommendationId }, extra).then((r) => r.visit);
  return { ali, sami, rec, at, visit };
}

describe("بيانات الخريطة (المهمة 23)", () => {
  beforeEach(resetDb);

  it("دبوس لكل خط من آخر زيارة فيها GPS، ولونه حسب آخر توصية", async () => {
    const { ali, sami, rec, at, visit } = await setup();
    await visit(ali, "2026-10-01", "G-1111-001", rec.violation, at(31.5, 34.45));
    await visit(sami, "2026-11-02", "G-1111-001", rec.fine, at(31.51, 34.46)); // الأحدث بموقع
    await visit(ali, "2026-11-05", "G-1111-001", rec.revisit); // الأحدث بدون موقع: التوصية منه، الموقع من اللي قبله
    await visit(ali, "2026-11-03", "G-2222-001", rec.violation); // بدون موقع أبداً

    const m = await mapData({});
    expect(m.pins).toHaveLength(1);
    const p = m.pins[0];
    expect(p).toMatchObject({
      codeKey: "G1111001",
      code: "G-1111-001",
      name: "محل غزة",
      region: "غزة",
      lat: 31.51,
      lng: 34.46,
      visits: 3,
      lastVisitOn: "2026-11-05",
      lastRec: "إعادة زيارة",
      color: "#e07b00",
    });
    // الخط اللي ما إله موقع بينعدّ
    expect(m.withoutLocation).toBe(1);
  });

  it("الفلاتر: المنطقة، التوصية، الفترة، السفير", async () => {
    const { ali, sami, rec, at, visit } = await setup();
    await visit(ali, "2026-10-10", "G-1111-001", rec.violation, at(31.5, 34.45));
    await visit(sami, "2026-11-10", "G-2222-001", rec.fine, at(31.42, 34.35));
    await visit(sami, "2026-11-11", "G-3333-001", rec.violation, at(31.28, 34.25));

    const codes = async (f: Parameters<typeof mapData>[0]) => (await mapData(f)).pins.map((p) => p.code).sort();
    expect(await codes({ region: "الوسطى" })).toEqual(["G-2222-001"]);
    expect(await codes({ recommendationId: rec.violation })).toEqual(["G-1111-001", "G-3333-001"]);
    expect(await codes({ from: "2026-11-01" })).toEqual(["G-2222-001", "G-3333-001"]);
    expect(await codes({ to: "2026-10-31" })).toEqual(["G-1111-001"]);
    expect(await codes({ ownerId: ali.id })).toEqual(["G-1111-001"]);
  });

  it("الزيارات المحذوفة والحالات الخاصة ما بتطلع", async () => {
    const { ali, rec, at, visit } = await setup();
    const v = await visit(ali, "2026-11-01", "G-1111-001", rec.violation, at(31.5, 34.45));
    await prisma.visit.update({ where: { id: v.id }, data: { deletedAt: new Date() } });
    await createVisit(ali, { visitedOn: "2026-11-02", specialCase: true, accountName: "حالة", recommendationId: rec.fine }, at(31.4, 34.3));
    const m = await mapData({});
    expect(m.pins).toEqual([]);
    expect(m.withoutLocation).toBe(0);
  });

  it("طبقة VPN: الحالات اللي إلها موقع بس", async () => {
    const { ali } = await setup();
    await createVpnCase(ali, { networkName: "شبكة أ", ip: "10.0.0.1", gps: { lat: 31.5, lng: 34.4, accuracy: 20 } });
    await createVpnCase(ali, { networkName: "شبكة ب", ip: "10.0.0.2" });
    const m = await mapData({});
    expect(m.vpn).toHaveLength(1);
    expect(m.vpn[0]).toMatchObject({ networkName: "شبكة أ", ip: "10.0.0.1", lat: 31.5, lng: 34.4 });
  });
});
