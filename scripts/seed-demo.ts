/**
 * نسخة العرض للإدارة: بيانات وهمية بالكامل، ولا حرف من بيانات مشتركين حقيقية.
 *
 *   DATABASE_URL=… DEMO_PASSWORD=… npx tsx scripts/seed-demo.ts
 *
 * بيرفض يشتغل إذا قاعدة البيانات فيها أي خط أو زيارة، عشان ما يخلط بيانات حقيقية بوهمية.
 * الأكواد كلها بتبلّش بـ T- (تجريبي) والـ IP كلها من نطاقات خاصة (10.x).
 *
 * الحسابات (كلها بنفس كلمة السر DEMO_PASSWORD):
 *   ali (سفير) · sami (سفير) · yousef (سفير) · boss (مسؤول للقراءة)
 */
import "dotenv/config";
import { prisma } from "../lib/db";
import { createUser } from "../lib/users";
import { createVisit, updateStatus } from "../lib/visits";
import { createVpnCase } from "../lib/vpn";
import { createCard } from "../lib/cards";
import { postponeRevisit } from "../lib/revisits";
import { requestReportEdit } from "../lib/edit-requests";
import { saveCredential } from "../lib/mikrotik-credentials";
import { todayLocal } from "../lib/dates";
import type { Actor } from "../lib/authz";

// عشوائي ثابت: نفس البيانات كل مرة
let seed = 20261113;
const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
const pick = <T>(a: readonly T[]) => a[Math.floor(rnd() * a.length)];
const int = (lo: number, hi: number) => lo + Math.floor(rnd() * (hi - lo + 1));

const PREFIX = ["محل", "مؤسسة", "شركة", "معرض", "مركز", "سوبرماركت", "مقهى", "مكتب"];
const WORD = ["الأمل", "النور", "الفجر", "البحر", "السلام", "الريان", "الياسمين", "الزيتون", "الشروق", "الوفاء", "الهدى", "النخيل", "الربيع", "الواحة"];
const SUFFIX = ["للاتصالات", "التجاري", "للإلكترونيات", "للخدمات", "للتجارة العامة", "", "للإنترنت"];
const REGIONS = [
  { region: "غزة", localities: ["الرمال", "الشيخ رضوان", "تل الهوا", "الشجاعية"], center: [31.515, 34.455] },
  { region: "الوسطى", localities: ["دير البلح", "النصيرات", "البريج", "المغازي"], center: [31.42, 34.36] },
  { region: "الجنوب", localities: ["خانيونس", "رفح", "بني سهيلا", "عبسان"], center: [31.33, 34.29] },
] as const;
const MANAGERS = ["مدير حساب أ", "مدير حساب ب", "مدير حساب ج"];
const SPEEDS = ["8M", "16M", "20M", "30M", "50M", "100M"];
const TESTS = [
  "فحص سرعة الخط وعدد الأجهزة المتصلة",
  "فحص الراوتر والمايكروتيك وتوزيع الشبكة",
  "فحص الشبكات اللاسلكية القريبة والـ IP الظاهر",
  "مطابقة عدد المستخدمين مع نوع الاشتراك",
];
const RESULTS: Record<string, string[]> = {
  "يوجد تجاوز": ["الخط موزّع على شبكة خارجية بأكتر من 20 مستخدم", "في بيع بطاقات إنترنت من الخط"],
  "لا يوجد تجاوز": ["الاستخدام مطابق للاشتراك", "الأجهزة كلها داخل المحل"],
  "إعادة زيارة": ["المحل مسكّر وقت الزيارة", "صاحب الخط مش موجود، بدنا نرجع"],
  "زيارة غير ناجحة": ["ما قدرنا نوصل للمكان", "رفض يسمح بالفحص"],
  "فحص شبكة": ["في شبكة مجهولة قريبة بتحتاج متابعة", "فحص الشبكات المحيطة"],
};

const warn = (e: unknown) => console.warn("تنبيه:", (e as Error)?.message ?? e);

function daysAgo(n: number) {
  const d = new Date(`${todayLocal()}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

async function main() {
  const password = process.env.DEMO_PASSWORD;
  if (!password || password.length < 8) throw new Error("DEMO_PASSWORD لازم ينضبط (8 أحرف على الأقل)");
  const [lines, visits] = await Promise.all([prisma.line.count(), prisma.visit.count()]);
  if (lines || visits) throw new Error("قاعدة البيانات فيها بيانات. نسخة العرض لازم تكون على قاعدة فاضية.");

  // الحسابات
  const mk = async (username: string, displayName: string, role: "AMBASSADOR" | "MANAGER") => {
    const { user } = await createUser(null, { username, displayName, role, password });
    return { id: user.id, role: user.role, active: true } as Actor;
  };
  const amb = [
    await mk("ali", "علي (تجريبي)", "AMBASSADOR"),
    await mk("sami", "سامي (تجريبي)", "AMBASSADOR"),
    await mk("yousef", "يوسف (تجريبي)", "AMBASSADOR"),
  ];
  await mk("boss", "المسؤول (تجريبي)", "MANAGER");

  // خطوط وهمية متل ملف الشهر
  const lineRows = [];
  for (let i = 0; i < 160; i++) {
    const r = pick(REGIONS);
    const account = 1000 + i * 7;
    const count = rnd() < 0.2 ? 2 : 1;
    const name = `${pick(PREFIX)} ${pick(WORD)} ${pick(SUFFIX)}`.trim();
    for (let n = 1; n <= count; n++) {
      const code = `T-${account}-00${n}`;
      lineRows.push({
        codeKey: code.replace(/-/g, ""),
        code,
        accountKey: `T${account}`,
        accountName: name,
        speed: pick(SPEEDS),
        region: r.region,
        locality: pick(r.localities),
        accountManager: pick(MANAGERS),
        fixedIp: `10.${int(10, 99)}.${int(0, 255)}.${int(1, 254)}`,
      });
    }
  }
  await prisma.line.createMany({ data: lineRows });
  const allLines = await prisma.line.findMany();
  const center = new Map<string, readonly number[]>(REGIONS.map((r) => [r.region, r.center]));

  const recs = new Map((await prisma.listItem.findMany({ where: { kind: "RECOMMENDATION", active: true } })).map((r) => [r.label, r.id]));
  const actions = new Map((await prisma.listItem.findMany({ where: { kind: "ACTION", active: true } })).map((r) => [r.label, r.id]));
  const questions = await prisma.mikrotikQuestion.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" } });

  // زيارات آخر 12 شهر، أكتر بالأشهر الأخيرة
  const weights: Array<[string, number]> = [
    ["يوجد تجاوز", 0.32],
    ["لا يوجد تجاوز", 0.38],
    ["إعادة زيارة", 0.12],
    ["زيارة غير ناجحة", 0.08],
    ["فحص شبكة", 0.1],
  ];
  const chooseRec = () => {
    let x = rnd();
    for (const [l, w] of weights) if ((x -= w) <= 0) return l;
    return "لا يوجد تجاوز";
  };
  const created: Array<{ id: string; rec: string; owner: Actor; code: string }> = [];
  const shuffled = [...allLines].sort(() => rnd() - 0.5);
  let made = 0;
  for (let i = 0; i < 420; i++) {
    const line = shuffled[i % shuffled.length];
    const ago = Math.floor(Math.pow(rnd(), 1.6) * 360);
    const owner = pick(amb);
    const rec = chooseRec();
    const [la, ln] = center.get(line.region!)!;
    const withGps = ago < 200 && rnd() < 0.85;
    const answers = rnd() < 0.6
      ? questions.map((q) => ({ questionId: q.id, question: q.text, answer: pick(q.options) }))
      : null;
    const action =
      rec === "يوجد تجاوز" && rnd() < 0.8
        ? actions.get(pick(["تم تصويب الوضع", "تم تجميد الخدمة", "تحذير + تعهد عدلي", "فصل الخدمة نهائياً"]))
        : rec === "لا يوجد تجاوز" && rnd() < 0.3
          ? actions.get("لا يوجد تجاوز بمعرفة مدير الحساب")
          : undefined;
    const companion = rnd() < 0.25 ? amb.filter((a) => a.id !== owner.id).map((a) => a.id).slice(0, 1) : [];
    const { visit } = await createVisit(
      owner,
      {
        visitedOn: daysAgo(ago),
        lineCode: line.code,
        recommendationId: recs.get(rec)!,
        actionId: action,
        tests: pick(TESTS),
        result: pick(RESULTS[rec]),
        companionIds: companion,
      },
      {
        gps: withGps ? { lat: la + (rnd() - 0.5) * 0.06, lng: ln + (rnd() - 0.5) * 0.06, accuracy: int(5, 40) } : null,
        mikrotik: answers,
      },
    );
    created.push({ id: visit.id, rec, owner, code: line.code });
    made++;
  }

  // تأجيلات على إعادات الزيارة المفتوحة
  const revisits = created.filter((c) => c.rec === "إعادة زيارة").slice(-12);
  for (const [i, r] of revisits.entries()) {
    await postponeRevisit(r.owner, r.id, "السيارة مش متاحة اليوم").catch(warn);
    if (i % 3 === 0) await postponeRevisit(r.owner, r.id, "المحل مسكّر للجرد").catch(warn);
  }

  // تجاوز بدون إجراء، وتعديل حالة
  const v = created.find((c) => c.rec === "يوجد تجاوز");
  if (v) await updateStatus(v.owner, v.id, { recommendationId: recs.get("يوجد تجاوز")!, actionId: null, revisitDue: null }).catch(warn);

  // طلب تعديل بين سفيرين
  const target = created.find((c) => c.owner.id === amb[1].id);
  if (target) await requestReportEdit(amb[0], target.id, { changes: { result: "تصحيح: عدد المستخدمين 25 مش 20" }, reason: "رقمنا الصحيح بعد المراجعة" }).catch(warn);

  // بيانات دخول مايكروتيك (لو المفتاح مضبوط)
  if (process.env.MIKROTIK_KEY) {
    for (const c of created.slice(0, 5)) await saveCredential(c.owner, { lineCode: c.code, username: "company", password: "demo-router-pass" }).catch(warn);
  }

  // حالات VPN وبطاقات
  for (let i = 0; i < 18; i++) {
    const r = pick(REGIONS);
    const owner = pick(amb);
    await createVpnCase(owner, {
      networkName: `${pick(WORD)}-NET`,
      ip: `10.${int(100, 120)}.${int(0, 255)}.${int(1, 254)}`,
      placeText: `${r.region} · ${pick(r.localities)}`,
      suspects: rnd() < 0.5 ? `T-${1000 + int(0, 159) * 7}-001` : null,
      gps: { lat: r.center[0] + (rnd() - 0.5) * 0.05, lng: r.center[1] + (rnd() - 0.5) * 0.05, accuracy: int(5, 30) },
    });
  }
  for (let i = 0; i < 40; i++) {
    const ago = int(0, 60);
    const at = new Date(`${daysAgo(ago)}T${String(int(8, 15)).padStart(2, "0")}:${String(int(0, 59)).padStart(2, "0")}:00+02:00`);
    await createCard(pick(amb), { name: `بطاقة ${pick(WORD)}-NET`, price: pick([2, 3, 5, 5, 10]), ip: `10.${int(100, 120)}.${int(0, 255)}.${int(1, 254)}` }, { filledAt: at });
  }

  console.log(`نسخة العرض جاهزة: ${allLines.length} خط، ${made} زيارة، 18 حالة VPN، 40 بطاقة`);
  console.log("الحسابات: ali, sami, yousef (سفراء) و boss (مسؤول) — كلها بكلمة السر DEMO_PASSWORD");
}

main()
  .catch((err) => {
    console.error(err?.issues?.[0]?.message ?? err?.message ?? err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
