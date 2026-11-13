import { beforeEach, describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { processSyncItem } from "@/lib/sync";
import { decodeImage, readAttachment } from "@/lib/attachments";
import { decryptSecret, encryptSecret } from "@/lib/crypto";
import { lastMikrotikAnswers, linesNeedingAccess, mikrotikQuestions } from "@/lib/mikrotik";
import { revealCredential, revealLog, saveCredential } from "@/lib/mikrotik-credentials";
import { createVpnCase, findVpnCases } from "@/lib/vpn";
import { cardDaily, cardMonthly, createCard } from "@/lib/cards";
import { addManualLine } from "@/lib/lines";
import { prisma, resetDb, sessionActor, listId } from "./helpers";

// أصغر صورة JPEG وPNG صالحة
const JPEG =
  "data:image/jpeg;base64," +
  Buffer.from([0xff, 0xd8, 0xff, 0xe0, ...Array(60).fill(0), 0xff, 0xd9]).toString("base64");
const PNG =
  "data:image/png;base64," +
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...Array(40).fill(0)]).toString("base64");
const uuid = () => crypto.randomUUID();

async function setup() {
  const ali = await sessionActor("ali");
  const sami = await sessionActor("sami");
  const boss = await sessionActor("boss", "MANAGER");
  await addManualLine(ali.id, { code: "G-7872-002", accountName: "مقهى", locality: "غزة" });
  const fine = await listId("RECOMMENDATION", "لا يوجد تجاوز");
  const qs = await mikrotikQuestions();
  const q = (role: string) => qs.find((x) => x.role === role)!;
  return { ali, sami, boss, fine, qs, q };
}

describe("الصور", () => {
  it("بتنقبل JPEG وPNG حقيقيين بس، وبحد للحجم", () => {
    expect(decodeImage(JPEG).mime).toBe("image/jpeg");
    expect(decodeImage(PNG).mime).toBe("image/png");
    // اسمها صورة بس محتواها نص
    expect(() =>
      decodeImage("data:image/jpeg;base64," + Buffer.from("<script>alert(1)</script>").toString("base64")),
    ).toThrow("صورة");
    expect(() => decodeImage("data:text/html;base64,PGgxPg==")).toThrow("صورة");
    const big =
      "data:image/jpeg;base64," +
      Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.alloc(2_200_000)]).toString("base64");
    expect(() => decodeImage(big)).toThrow("كبيرة");
  });
});

describe("التشفير", () => {
  it("بيرجع نفس النص، وكل مرة شكل مختلف، وأي تلاعب بينكشف", () => {
    const a = encryptSecret("p@ss-123");
    const b = encryptSecret("p@ss-123");
    expect(a).not.toBe(b);
    expect(a).not.toContain("p@ss");
    expect(decryptSecret(a)).toBe("p@ss-123");
    const raw = Buffer.from(a.slice(3), "base64");
    raw[raw.length - 1] ^= 1;
    expect(() => decryptSecret(`v1:${raw.toString("base64")}`)).toThrow();
  });
});

describe("المزامنة من الجوال (المهمة 17)", () => {
  beforeEach(resetDb);

  it("زيارة بوقت التعبئة وموقعها وصورها وإجابات المايكروتيك، ومرة وحدة حتى لو انبعتت مرتين", async () => {
    const { ali, fine, q } = await setup();
    const item = {
      uuid: uuid(),
      kind: "VISIT" as const,
      filledAt: "2026-11-12T21:30:00.000Z", // 23:30 بتوقيت فلسطين يوم 12
      payload: {
        lineCode: "G-7872-002",
        recommendationId: fine,
        result: "تمام",
        gps: { lat: 31.5, lng: 34.46, accuracy: 12.5 },
        photos: [JPEG, PNG],
        mikrotik: [
          { questionId: q("ACCESS").id, answer: "لا" },
          { questionId: q("USER_CREATED").id, answer: "لسا" },
        ],
      },
    };
    const first = await processSyncItem(ali, item);
    const again = await processSyncItem(ali, item);
    expect(first.status).toBe("created");
    expect(again).toMatchObject({ status: "duplicate", entityId: first.entityId });
    expect(await prisma.visit.count()).toBe(1);

    const v = await prisma.visit.findUniqueOrThrow({ where: { id: first.entityId } });
    expect(v.filledAt?.toISOString()).toBe("2026-11-12T21:30:00.000Z");
    expect(v.visitedOn?.toISOString().slice(0, 10)).toBe("2026-11-12");
    expect(v).toMatchObject({ lat: 31.5, lng: 34.46, gpsAccuracy: 12.5, clientUuid: item.uuid });
    expect(v.mikrotik).toEqual([
      { questionId: q("ACCESS").id, question: q("ACCESS").text, answer: "لا" },
      { questionId: q("USER_CREATED").id, question: q("USER_CREATED").text, answer: "لسا" },
    ]);
    const files = await prisma.attachment.findMany({ where: { entityId: v.id } });
    expect(files.map((f) => f.mime).sort()).toEqual(["image/jpeg", "image/png"]);
    expect(files.every((f) => existsSync(f.path) && !f.path.includes("/public/"))).toBe(true);
    expect((await readAttachment(files[0].id))?.buffer.length).toBeGreaterThan(10);
  });

  it("إرسالين بنفس الوقت لنفس العنصر: واحد بس بينحفظ", async () => {
    const { ali, fine } = await setup();
    const item = {
      uuid: uuid(),
      kind: "VISIT" as const,
      filledAt: new Date().toISOString(),
      payload: { lineCode: "G-7872-002", recommendationId: fine },
    };
    const results = await Promise.all([
      processSyncItem(ali, item),
      processSyncItem(ali, item),
      processSyncItem(ali, item),
    ]);
    expect(results.filter((r) => r.status === "created")).toHaveLength(1);
    expect(new Set(results.map((r) => r.entityId)).size).toBe(1);
    expect(await prisma.visit.count()).toBe(1);
  });

  it("إجابة مايكروتيك مش من الخيارات بترفض، ووقت تعبئة بالمستقبل بيرفض", async () => {
    const { ali, fine, q } = await setup();
    await expect(
      processSyncItem(ali, {
        uuid: uuid(),
        kind: "VISIT",
        filledAt: new Date().toISOString(),
        payload: {
          lineCode: "G-7872-002",
          recommendationId: fine,
          mikrotik: [{ questionId: q("ACCESS").id, answer: "يمكن" }],
        },
      }),
    ).rejects.toThrow("المايكروتيك");
    await expect(
      processSyncItem(ali, {
        uuid: uuid(),
        kind: "VISIT",
        filledAt: new Date(Date.now() + 3600_000).toISOString(),
        payload: { lineCode: "G-7872-002", recommendationId: fine },
      }),
    ).rejects.toThrow("وقت");
  });

  it("المسؤول ما بيبعت من الجوال", async () => {
    const { boss } = await setup();
    await expect(
      processSyncItem(boss, {
        uuid: uuid(),
        kind: "VPN",
        filledAt: new Date().toISOString(),
        payload: { networkName: "x", ip: "1.1.1.1" },
      }),
    ).rejects.toMatchObject({ status: 403 });
  });
});

describe("أسئلة المايكروتيك (المهمة 18)", () => {
  beforeEach(resetDb);

  it("آخر إجابات ببطاقة الخط، وقائمة «بحاجة access» بتتحدّث مع آخر زيارة", async () => {
    const { ali, fine, q } = await setup();
    const send = (answers: Array<[string, string]>, filledAt: string) =>
      processSyncItem(ali, {
        uuid: uuid(),
        kind: "VISIT",
        filledAt,
        payload: {
          lineCode: "G-7872-002",
          recommendationId: fine,
          mikrotik: answers.map(([role, answer]) => ({ questionId: q(role).id, answer })),
        },
      });
    await send(
      [
        ["ACCESS", "لا"],
        ["USER_CREATED", "لسا"],
      ],
      "2026-11-01T08:00:00Z",
    );
    expect((await linesNeedingAccess()).map((l) => l.lineCodeKey)).toEqual(["G7872002"]);
    expect((await lastMikrotikAnswers("G7872002"))?.answers.map((a) => a.answer)).toEqual(["لا", "لسا"]);
    await send([["ACCESS", "نعم"]], "2026-11-05T08:00:00Z");
    expect(await linesNeedingAccess()).toEqual([]);
  });
});

describe("بيانات دخول المايكروتيك (المهمة 19)", () => {
  beforeEach(resetDb);

  it("بتنحفظ مشفّرة، وبتنعرض للسفير بعد كلمة سر حسابه، وكل عرض بينسجل", async () => {
    const { ali, sami } = await setup();
    const cred = await saveCredential(ali, { lineCode: "G-7872-002", username: "jawwal", password: "Mk-Secret-99" });
    const row = await prisma.mikrotikCredential.findUniqueOrThrow({ where: { id: cred.id } });
    expect(row.passwordCipher).not.toContain("Mk-Secret");
    expect(JSON.stringify((await prisma.auditLog.findMany()).map((l) => ({ ...l, id: String(l.id) })))).not.toContain(
      "Mk-Secret",
    );

    await expect(revealCredential(sami, cred.id, "wrong-password")).rejects.toMatchObject({ status: 403 });
    expect(await revealCredential(sami, cred.id, "correct-horse-1")).toEqual({
      username: "jawwal",
      password: "Mk-Secret-99",
    });
    const log = await revealLog(sami);
    expect(log).toHaveLength(1);
    expect(log[0]).toMatchObject({ lineCodeKey: "G7872002", user: { displayName: "sami" } });
    await expect(prisma.mikrotikReveal.deleteMany({})).rejects.toThrow(/append-only/);
  });

  it("المسؤول ما بيشوف كلمة السر ولا سجل العرض", async () => {
    const { ali, boss } = await setup();
    const cred = await saveCredential(ali, { lineCode: "G-7872-002", username: "u", password: "p-123456" });
    await expect(revealCredential(boss, cred.id, "correct-horse-1")).rejects.toMatchObject({ status: 403 });
    await expect(revealLog(boss)).rejects.toMatchObject({ status: 403 });
  });
});

describe("حالات VPN (المهمة 20)", () => {
  beforeEach(resetDb);

  it("IP لازم يكون صحيح، والتكرار بالـ IP أو الاسم بيبيّن الحالات السابقة", async () => {
    const { ali, sami } = await setup();
    await expect(createVpnCase(ali, { networkName: "شبكة", ip: "999.1.1.1" })).rejects.toThrow("IP");
    const a = await createVpnCase(ali, { networkName: "شبكة النور", ip: "10.20.30.40", placeText: "قرب الجامع" });
    expect(a.previous).toEqual([]);
    const b = await createVpnCase(sami, { networkName: "شبكة  النور ", ip: "10.20.30.41" });
    expect(b.previous.map((p) => p.id)).toEqual([a.vpn.id]);
    const c = await createVpnCase(sami, { networkName: "غيرها", ip: "10.20.30.40" });
    expect(c.previous.map((p) => p.id)).toEqual([a.vpn.id]);
    expect((await findVpnCases({ q: "10.20.30.40" })).map((x) => x.id).sort()).toEqual([a.vpn.id, c.vpn.id].sort());
    expect(await findVpnCases({ q: "النور" })).toHaveLength(2);
  });
});

describe("شراء البطاقات (المهمة 21)", () => {
  beforeEach(resetDb);

  it("مجموع اليوم والشهر مطابق، والفلتر حسب السفير", async () => {
    const { ali, sami } = await setup();
    const at = (iso: string) => ({ filledAt: new Date(iso) });
    await createCard(ali, { name: "بطاقة 1", price: 5 }, at("2026-11-01T08:00:00Z"));
    await createCard(ali, { name: "بطاقة 2", price: 10.5 }, at("2026-11-01T20:00:00Z"));
    await createCard(sami, { name: "بطاقة 3", price: 3 }, at("2026-11-01T22:30:00Z")); // 00:30 يوم 2 بفلسطين
    await createCard(ali, { name: "بطاقة 4", price: 7 }, at("2026-10-31T09:00:00Z"));

    const days = await cardDaily({ month: "2026-11" });
    expect(days).toEqual([
      { day: "2026-11-02", count: 1, total: 3 },
      { day: "2026-11-01", count: 2, total: 15.5 },
    ]);
    const m = await cardMonthly({ month: "2026-11" });
    expect(m.total).toBe(18.5);
    expect(m.rows).toHaveLength(3);
    expect(m.byOwner).toEqual([
      { ownerId: ali.id, name: "ali", count: 2, total: 15.5 },
      { ownerId: sami.id, name: "sami", count: 1, total: 3 },
    ]);
    expect((await cardMonthly({ month: "2026-11", ownerId: ali.id })).total).toBe(15.5);
  });

  it("السعر لازم يكون موجب، والربط بزيارة بده رقم", async () => {
    const { ali } = await setup();
    await expect(createCard(ali, { name: "x", price: 0 })).rejects.toThrow("السعر");
    await expect(createCard(ali, { name: "x", price: 5, linkKind: "VISIT" })).rejects.toThrow("الزيارة");
  });
});
