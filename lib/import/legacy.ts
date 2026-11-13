/**
 * نقل الزيارات القديمة من إكسل علي (ورقة Sheet1) للنظام.
 *
 * - الصفوف بدون رقم زيارة بتندمج بالزيارة اللي فوقها (زي ما بيعمل الملف الحالي)
 * - التواريخ بتتصحح حسب lib/import/legacy-dates.ts، والمشكوك فيها بتطلع بالتقرير
 * - التوصية والإجراء بيتوحدوا مع القوائم، والقيمة المش معروفة بتنضاف كقيمة موقوفة
 * - الزيارة بدون Line Code صالح بتصير «حالة خاصة»
 * - السفير «غير محدد» (ownerId = null)
 * - التشغيل أكتر من مرة ما بيكرر: كل زيارة إلها مفتاح ثابت (legacyKey)
 */
import { prisma as defaultPrisma, type Db } from "../db";
import { withAudit } from "../audit";
import { ApiError } from "../errors";
import { displayLineCode, isValidLineCode, normalizeLineCode } from "../line-code";
import type { ListKind } from "../lists";
import { flagOutOfOrder, parseLegacyDate, type LegacyDateMethod } from "./legacy-dates";
import { matchListValue, normArabic } from "./legacy-values";
import { readWorkbook, type Cell, type Sheet } from "./workbook";

export interface LegacyVisit {
  legacyKey: string;
  row: number;
  number: number;
  visitedOn: Date | null;
  dateText: string | null;
  dateMethod: LegacyDateMethod;
  dateDoubtful: boolean;
  lineCode: string | null;
  lineCodeKey: string | null;
  accountName: string | null;
  specialCase: boolean;
  tests: string | null;
  result: string | null;
  recommendation: string | null; // اسم القيمة بالقائمة بعد التوحيد
  action: string | null;
  revisitNote: string | null;
}

export interface LegacyPlan {
  sheet: string;
  visits: LegacyVisit[];
  doubtful: Array<{ number: number; row: number; dateText: string | null; reason: string }>;
  duplicateNumbers: Array<{ number: number; rows: number[] }>;
  unknownValues: Array<{ kind: ListKind; label: string; count: number }>;
  recommendationCounts: Record<string, number>;
  specialCases: Array<{ number: number; row: number; accountName: string | null; lineCode: string | null }>;
  summary: { visits: number; mergedRows: number; specialCases: number; doubtfulDates: number; maxNumber: number };
}

function text(v: Cell | undefined): string | null {
  if (v === null || v === undefined) return null;
  const s = (v instanceof Date ? v.toISOString().slice(0, 10) : String(v)).replace(/[ \t]+/g, " ").trim();
  return s === "" || s === "None" ? null : s;
}

function join(a: string | null, b: string | null): string | null {
  if (!b) return a;
  if (!a) return b;
  return `${a}\n${b}`;
}

function findSheet(sheets: Sheet[]): Sheet {
  const sheet =
    sheets.find((s) => s.name === "Sheet1") ??
    sheets.find((s) => normArabic(s.headers[0] ?? "") === normArabic("م.") && s.headers.some((h) => /تاريخ/.test(h)));
  if (!sheet) throw new ApiError(400, "ما لقينا ورقة الزيارات (Sheet1) بالملف");
  return sheet;
}

export async function analyzeLegacyFile(
  buffer: Buffer,
  opts: { today: Date },
  db: Db = defaultPrisma,
): Promise<LegacyPlan> {
  const sheet = findSheet(await readWorkbook(buffer));
  const h = sheet.headers; // الأعمدة بالترتيب: م.، التاريخ، الحساب، الكود، الفحوصات، النتيجة، التوصية، الإجراء، إعادة الزيارة
  const col = (cells: Record<string, Cell>, i: number) => (h[i] ? cells[h[i]] : null);

  const [recLabels, actLabels] = await Promise.all(
    (["RECOMMENDATION", "ACTION"] as const).map(async (kind) =>
      (await db.listItem.findMany({ where: { kind }, select: { label: true } })).map((l) => l.label),
    ),
  );

  type Draft = Omit<LegacyVisit, "legacyKey" | "recommendation" | "action"> & {
    recRaw: string | null;
    actRaw: string | null;
    dateReason?: string;
    codeText: string | null;
  };
  const drafts: Draft[] = [];
  let mergedRows = 0;

  for (const { rowNumber, cells } of sheet.rows) {
    const no = col(cells, 0);
    if (typeof no !== "number") {
      const values = [4, 5, 6, 7, 8].map((i) => text(col(cells, i)));
      // صف قبل أول زيارة (متل صف العناوين التاني بالملف) بيتجاهل
      const prev = drafts.at(-1);
      if (!prev || values.every((v) => v === null)) continue;
      prev.tests = join(prev.tests, values[0]);
      prev.result = join(prev.result, values[1]);
      prev.recRaw ??= values[2];
      prev.actRaw ??= values[3];
      prev.revisitNote = join(prev.revisitNote, values[4]);
      mergedRows++;
      continue;
    }
    const rawDate = col(cells, 1);
    const parsed = parseLegacyDate(rawDate);
    const rawCode = col(cells, 3);
    const valid = isValidLineCode(rawCode);
    drafts.push({
      row: rowNumber,
      number: Math.trunc(no),
      visitedOn: parsed.date,
      dateText: rawDate instanceof Date ? rawDate.toISOString().slice(0, 10) : text(rawDate),
      dateMethod: parsed.method,
      dateDoubtful: parsed.doubtful,
      dateReason: parsed.reason,
      codeText: text(rawCode),
      lineCode: valid ? displayLineCode(rawCode) : null,
      lineCodeKey: valid ? normalizeLineCode(rawCode) : null,
      accountName: text(col(cells, 2)),
      specialCase: !valid,
      tests: text(col(cells, 4)),
      result: text(col(cells, 5)),
      recRaw: text(col(cells, 6)),
      actRaw: text(col(cells, 7)),
      revisitNote: text(col(cells, 8)),
    });
  }

  // التواريخ اللي خارج ترتيب الصفوف أو بالمستقبل
  const doubtful: LegacyPlan["doubtful"] = [];
  const orderFlags = flagOutOfOrder(
    drafts.map((d) => d.visitedOn),
    opts.today,
  );
  drafts.forEach((d, i) => {
    if (d.dateDoubtful) {
      doubtful.push({ number: d.number, row: d.row, dateText: d.dateText, reason: d.dateReason ?? "تاريخ مش مفهوم" });
    } else if (orderFlags[i]) {
      d.dateDoubtful = true;
      doubtful.push({
        number: d.number,
        row: d.row,
        dateText: d.dateText,
        reason: "خارج ترتيب الصفوف بأكتر من 3 أيام أو بالمستقبل",
      });
    }
  });

  // توحيد القيم
  const unknown = new Map<string, { kind: ListKind; label: string; count: number }>();
  const resolve = (kind: ListKind, raw: string | null, labels: string[]) => {
    if (!raw) return null;
    const match = matchListValue(kind, raw, labels);
    if (match) return match;
    const key = `${kind}|${normArabic(raw)}`;
    const u = unknown.get(key) ?? { kind, label: raw, count: 0 };
    u.count++;
    unknown.set(key, u);
    return u.label;
  };

  const occurrences = new Map<string, number>();
  const codeTexts = new Map(drafts.map((d) => [d.row, d.codeText]));
  const visits: LegacyVisit[] = drafts.map((draft) => {
    const { recRaw, actRaw, ...rest } = draft;
    const d = { ...rest };
    delete d.dateReason;
    delete (d as Partial<Draft>).codeText;
    const base = `legacy|${d.number}|${d.visitedOn?.toISOString().slice(0, 10) ?? d.dateText ?? ""}|${d.lineCodeKey ?? normArabic(d.accountName ?? "")}`;
    const n = (occurrences.get(base) ?? 0) + 1;
    occurrences.set(base, n);
    return {
      ...d,
      legacyKey: `${base}|${n}`,
      recommendation: resolve("RECOMMENDATION", recRaw, recLabels),
      action: resolve("ACTION", actRaw, actLabels),
    };
  });

  const byNumber = new Map<number, number[]>();
  for (const v of visits) byNumber.set(v.number, [...(byNumber.get(v.number) ?? []), v.row]);
  const recommendationCounts: Record<string, number> = {};
  for (const v of visits)
    if (v.recommendation) recommendationCounts[v.recommendation] = (recommendationCounts[v.recommendation] ?? 0) + 1;
  const specialCases = visits
    .filter((v) => v.specialCase)
    .map((v) => ({ number: v.number, row: v.row, accountName: v.accountName, lineCode: codeTexts.get(v.row) ?? null }));

  return {
    sheet: sheet.name,
    visits,
    doubtful,
    duplicateNumbers: [...byNumber.entries()]
      .filter(([, rows]) => rows.length > 1)
      .map(([number, rows]) => ({ number, rows })),
    unknownValues: [...unknown.values()],
    recommendationCounts,
    specialCases,
    summary: {
      visits: visits.length,
      mergedRows,
      specialCases: specialCases.length,
      doubtfulDates: doubtful.length,
      maxNumber: visits.reduce((m, v) => Math.max(m, v.number), 0),
    },
  };
}

const COMPARED = [
  "number",
  "visitedOn",
  "dateText",
  "dateDoubtful",
  "lineCode",
  "lineCodeKey",
  "accountName",
  "specialCase",
  "tests",
  "result",
  "revisitNote",
  "lineId",
  "recommendationId",
  "actionId",
] as const;

function same(a: unknown, b: unknown) {
  if (a instanceof Date || b instanceof Date) return (a as Date | null)?.getTime() === (b as Date | null)?.getTime();
  return a === b;
}

export async function applyLegacyImport(
  buffer: Buffer,
  opts: { today: Date; fileName: string; actorId?: string | null },
  db: Db = defaultPrisma,
): Promise<{ created: number; updated: number; unchanged: number; plan: LegacyPlan }> {
  const plan = await analyzeLegacyFile(buffer, opts, db);
  const counts = await withAudit(
    opts.actorId ?? null,
    async (tx, audit) => {
      // القيم المش معروفة: قيم موقوفة بالقائمة
      for (const u of plan.unknownValues) {
        const exists = await tx.listItem.findUnique({ where: { kind_label: { kind: u.kind, label: u.label } } });
        if (!exists) {
          const item = await tx.listItem.create({
            data: { kind: u.kind, label: u.label, active: false, sortOrder: 100 },
          });
          audit.created(
            "ListItem",
            item.id,
            { kind: item.kind, label: item.label, active: false },
            "قيمة قديمة من الإكسل",
          );
        }
      }
      const items = await tx.listItem.findMany();
      const itemId = (kind: ListKind, label: string | null) =>
        label ? (items.find((i) => i.kind === kind && i.label === label)?.id ?? null) : null;
      const keys = [...new Set(plan.visits.map((v) => v.lineCodeKey).filter((k): k is string => !!k))];
      const lineIds = new Map(
        (await tx.line.findMany({ where: { codeKey: { in: keys } }, select: { id: true, codeKey: true } })).map((l) => [
          l.codeKey,
          l.id,
        ]),
      );
      const existing = new Map((await tx.visit.findMany({ where: { source: "LEGACY" } })).map((v) => [v.legacyKey, v]));

      let created = 0;
      let updated = 0;
      let unchanged = 0;
      const toCreate = [];
      for (const v of plan.visits) {
        const data = {
          number: v.number,
          visitedOn: v.visitedOn,
          dateText: v.dateText,
          dateDoubtful: v.dateDoubtful,
          lineCode: v.lineCode,
          lineCodeKey: v.lineCodeKey,
          accountName: v.accountName,
          specialCase: v.specialCase,
          tests: v.tests,
          result: v.result,
          revisitNote: v.revisitNote,
          lineId: v.lineCodeKey ? (lineIds.get(v.lineCodeKey) ?? null) : null,
          recommendationId: itemId("RECOMMENDATION", v.recommendation),
          actionId: itemId("ACTION", v.action),
        };
        const prev = existing.get(v.legacyKey);
        if (!prev) {
          toCreate.push({ ...data, source: "LEGACY" as const, legacyKey: v.legacyKey });
          created++;
        } else if (COMPARED.some((f) => !same(prev[f], data[f]))) {
          await tx.visit.update({ where: { id: prev.id }, data });
          updated++;
        } else unchanged++;
      }
      if (toCreate.length) await tx.visit.createMany({ data: toCreate });

      // الزيارات الجديدة بالنظام بتكمل بعد أكبر رقم
      const max = await tx.visit.aggregate({ _max: { number: true } });
      if (max._max.number) await tx.$executeRaw`SELECT setval('visit_number_seq', ${max._max.number}::bigint, true)`;

      audit.event(
        "IMPORT",
        "Visit",
        "legacy",
        `نقل الزيارات القديمة (${opts.fileName}): ${created} جديدة، ${updated} تحدّثت، ${unchanged} ما تغيّرت، ${plan.summary.doubtfulDates} تاريخ للمراجعة`,
      );
      return { created, updated, unchanged };
    },
    db,
    { timeout: 300_000 },
  );
  return { ...counts, plan };
}
