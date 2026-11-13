/**
 * استيراد ملف الشهر اللي بيبعته المسؤول.
 *
 * شكل الملف (من ملفي شهر 10 و11):
 *  - «الزيارات الإجماليه»: سجل تراكمي فيه توصية السفراء و«الإجراء النهائي لمدير المنطقة» ← سجل الإدارة (LOG)
 *  - «زيارات جديدة» وأوراق المناطق: الخطوط المطلوب زيارتها هالشهر ← زيارات الشهر (TARGETS)
 *  - «استثناء من الزيارات» ← زيارات الشهر بس مستثناة (EXCLUDED)
 *  - أي ورقة بدون Line Code (متل الملخص) بتنتجاهل
 * أسماء الأوراق والأعمدة بتتغير من شهر لشهر، فالاكتشاف تلقائي ومعه خريطة أعمدة بيقدر السفير يعدّلها.
 *
 * analyzeMonthlyFile بيحسب كل شي بدون ما يكتب، وapplyMonthlyImport بيعيد نفس الحساب وبيكتبه،
 * فالمعاينة دايماً مطابقة للحفظ.
 */
import { createHash } from "node:crypto";
import { prisma as defaultPrisma, type Db } from "../db";
import { withAudit } from "../audit";
import { ApiError } from "../errors";
import { accountKeyOf, displayLineCode, isValidLineCode, normalizeLineCode, regionOf } from "../line-code";
import { readWorkbook, type Cell, type Sheet } from "./workbook";
import type { Prisma } from "../generated/prisma/client";

// ───────────── الأعمدة ─────────────

export const FIELDS = {
  code: { label: "Line Code", aliases: ["Line_Code", "Line Code", "LineCode", "لاين كود"] },
  accountName: { label: "اسم الحساب", aliases: ["account name", "اسم الحساب", "الحساب", "اسم الشركة"] },
  speed: { label: "السرعة", aliases: ["speed", "السرعة"] },
  locality: { label: "المكان (Locality)", aliases: ["Locality", "المنطقة"] },
  accountManager: { label: "مدير الحساب", aliases: ["Account Manager", "مدير الحساب"] },
  teamNote: { label: "ملاحظات الفريق", aliases: ["ملاحظات الفريق", "ملاحظات"] },
  visitDate: { label: "تاريخ الزيارة", aliases: ["تاريخ الزيارة", "تاريخ الزياره"] },
  recommendation: { label: "التوصية", aliases: ["توصية السفراء", "التوصية"] },
  finalAction: {
    label: "الإجراء النهائي لمدير المنطقة",
    aliases: ["الاجراء النهائي لمدير المنطقة بقطاع الاعمال", "الاجراء النهائي لمدير المنطقة", "الاجراء النهائي"],
  },
  fixedIp: { label: "Fixed IP", aliases: ["Fixed Ip", "Fixed IP", "IP"] },
  addrLocality: { label: "Addr Locality", aliases: ["Addr Locality"] },
  addrQuarter: { label: "Addr Quarter", aliases: ["Addr Quarter"] },
} as const;

export type Field = keyof typeof FIELDS;
export type ColumnMap = Partial<Record<Field, string>>;

/** اسم عمود موحّد: بدون مسافات أو _ أو -، والهمزات والتاء المربوطة والألف المقصورة موحدة */
export function normHeader(h: string): string {
  return h
    .toLowerCase()
    .replace(/[ً-ْـ]/g, "") // تشكيل وتطويل
    .replace(/[أإآ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .replace(/[\s_\-]+/g, "");
}

/** لكل حقل: العمود المقابل بالورقة (من الخريطة المحفوظة أولاً، وإلا من الأسماء المعروفة) */
function resolveColumns(headers: string[], columnMap: ColumnMap): Partial<Record<Field, string>> {
  const byNorm = new Map(headers.map((h) => [normHeader(h), h]));
  const out: Partial<Record<Field, string>> = {};
  for (const field of Object.keys(FIELDS) as Field[]) {
    const chosen = columnMap[field];
    if (chosen !== undefined) {
      const h = byNorm.get(normHeader(chosen));
      if (h) out[field] = h;
      continue; // اختيار صريح: ما بنرجع للاكتشاف التلقائي
    }
    for (const alias of FIELDS[field].aliases) {
      const h = byNorm.get(normHeader(alias));
      if (h) {
        out[field] = h;
        break;
      }
    }
  }
  return out;
}

// ───────────── القيم ─────────────

function text(v: Cell | undefined): string | null {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  const s = String(v).replace(/\s+/g, " ").trim();
  return s === "" ? null : s;
}

/** تاريخ من ملف الشهر: خلية تاريخ، أو نص يوم/شهر/سنة متل «14/09/2026» */
export function parseDayFirstDate(v: Cell | undefined): Date | null {
  if (v instanceof Date)
    return Number.isNaN(v.getTime()) ? null : new Date(Date.UTC(v.getUTCFullYear(), v.getUTCMonth(), v.getUTCDate()));
  const m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(String(v ?? "").trim());
  if (!m) return null;
  const [d, mo, y] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(Date.UTC(y, mo - 1, d));
  return date.getUTCMonth() === mo - 1 && date.getUTCDate() === d ? date : null;
}

// ───────────── التحليل ─────────────

export type SheetRole = "LOG" | "TARGETS" | "EXCLUDED" | "IGNORED";

export interface SheetInfo {
  name: string;
  role: SheetRole;
  rows: number;
  headers: string[];
  columns: Partial<Record<Field, string>>;
  extraColumns: string[]; // أعمدة بتنحفظ كأرقام الخط (Data Speed, Utilization...)
}

const LINE_FIELDS = [
  "code",
  "accountName",
  "speed",
  "locality",
  "region",
  "accountManager",
  "fixedIp",
  "addrLocality",
  "addrQuarter",
] as const;
type LineField = (typeof LINE_FIELDS)[number];
type LineData = { codeKey: string; accountKey: string } & Record<LineField, string | null>;

export interface LineChange {
  codeKey: string;
  code: string;
  changes: Partial<Record<LineField | "manual", { from: unknown; to: unknown }>>;
}

export interface TargetData {
  codeKey: string;
  sheet: string;
  region: string | null;
  teamNote: string | null;
  excluded: boolean;
  metrics: Record<string, string | number | boolean> | null;
}

export interface LogData {
  rowKey: string;
  codeKey: string;
  visitDate: Date | null;
  teamNote: string | null;
  recommendation: string | null;
  finalAction: string | null;
  accountManager: string | null;
}

export interface Problem {
  sheet: string;
  row: number;
  reason: string;
}

export interface MonthlyPlan {
  month: string;
  sheets: SheetInfo[];
  blocking: string[]; // مشاكل بتمنع الحفظ
  problems: Problem[]; // صفوف بتنتجاهل أو بدها انتباه
  unknownLocalities: string[];
  sameFileImportedBefore: boolean;
  fileSha256: string;
  lines: { new: LineData[]; changed: LineChange[]; present: string[] };
  targets: TargetData[];
  log: LogData[];
  summary: {
    newLines: number;
    changedLines: number;
    unchangedLines: number;
    missingFromFile: number;
    targets: number;
    excludedTargets: number;
    logRows: number;
    problems: number;
  };
}

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

function classify(sheet: Sheet, cols: Partial<Record<Field, string>>): SheetRole {
  if (!cols.code) return "IGNORED";
  if (cols.finalAction) return "LOG";
  if (/استثناء|مستثنى/.test(sheet.name)) return "EXCLUDED";
  return "TARGETS";
}

export async function analyzeMonthlyFile(
  buffer: Buffer,
  opts: { month: string; columnMap?: ColumnMap },
  db: Db = defaultPrisma,
): Promise<MonthlyPlan> {
  if (!MONTH_RE.test(opts.month)) throw new ApiError(400, "الشهر لازم يكون بصيغة 2026-11");
  const sheets = await readWorkbook(buffer);
  const fileSha256 = createHash("sha256").update(buffer).digest("hex");
  const columnMap = opts.columnMap ?? {};

  const infos: SheetInfo[] = [];
  const problems: Problem[] = [];
  const fileLines = new Map<string, LineData>();
  const targets = new Map<string, TargetData>();
  const log: LogData[] = [];
  const logOccurrences = new Map<string, number>();
  const unknownLocalities = new Set<string>();

  const parsed = sheets.map((sheet) => {
    const columns = resolveColumns(sheet.headers, columnMap);
    const role = classify(sheet, columns);
    const mapped = new Set(Object.values(columns));
    const extraColumns = role === "TARGETS" || role === "EXCLUDED" ? sheet.headers.filter((h) => !mapped.has(h)) : [];
    const info: SheetInfo = {
      name: sheet.name,
      role,
      rows: sheet.rows.length,
      headers: sheet.headers,
      columns,
      extraColumns,
    };
    infos.push(info);
    return { sheet, info };
  });

  // أوراق الزيارات: الأكبر أول، فورقة المنطقة الأصغر بتغلب «زيارات جديدة»، والاستثناء بالآخر
  const order: Record<SheetRole, number> = { TARGETS: 0, LOG: 1, EXCLUDED: 2, IGNORED: 3 };
  const ordered = [...parsed].sort(
    (a, b) =>
      order[a.info.role] - order[b.info.role] || b.info.rows - a.info.rows || a.info.name.localeCompare(b.info.name),
  );

  for (const { sheet, info } of ordered) {
    if (info.role === "IGNORED") continue;
    const c = info.columns;
    const seenInSheet = new Set<string>();
    for (const { rowNumber, cells } of sheet.rows) {
      const rawCode = c.code ? cells[c.code] : null;
      if (!isValidLineCode(rawCode)) {
        problems.push({
          sheet: sheet.name,
          row: rowNumber,
          reason: `بدون Line Code صالح (${text(rawCode) ?? "فاضي"})`,
        });
        continue;
      }
      const codeKey = normalizeLineCode(rawCode);
      const get = (f: Field) => (c[f] ? text(cells[c[f]!]) : null);
      const locality = get("locality");
      const region = regionOf(locality);
      if (locality && !region) unknownLocalities.add(locality);

      // بيانات الخط: أول قيمة مش فاضية بتغلب (أوراق الزيارات قبل السجل)
      const incoming: LineData = {
        codeKey,
        accountKey: accountKeyOf(rawCode),
        code: displayLineCode(rawCode),
        accountName: get("accountName"),
        speed: get("speed"),
        locality,
        region,
        accountManager: get("accountManager"),
        fixedIp: get("fixedIp"),
        addrLocality: get("addrLocality"),
        addrQuarter: get("addrQuarter"),
      };
      const existing = fileLines.get(codeKey);
      if (!existing) fileLines.set(codeKey, incoming);
      else for (const f of LINE_FIELDS) existing[f] ??= incoming[f];

      if (info.role === "LOG") {
        const visitDate = c.visitDate ? parseDayFirstDate(cells[c.visitDate]) : null;
        if (c.visitDate && cells[c.visitDate] !== null && !visitDate) {
          problems.push({ sheet: sheet.name, row: rowNumber, reason: `تاريخ مش مفهوم: ${text(cells[c.visitDate])}` });
        }
        const base = `${codeKey}|${visitDate ? visitDate.toISOString().slice(0, 10) : "بدون-تاريخ"}`;
        const n = (logOccurrences.get(base) ?? 0) + 1;
        logOccurrences.set(base, n);
        log.push({
          rowKey: `${base}|${n}`,
          codeKey,
          visitDate,
          teamNote: get("teamNote"),
          recommendation: get("recommendation"),
          finalAction: get("finalAction"),
          accountManager: get("accountManager"),
        });
        continue;
      }

      if (seenInSheet.has(codeKey)) {
        problems.push({ sheet: sheet.name, row: rowNumber, reason: `خط مكرر بنفس الورقة: ${incoming.code}` });
        continue;
      }
      seenInSheet.add(codeKey);
      const metrics: Record<string, string | number | boolean> = {};
      for (const h of info.extraColumns) {
        const v = cells[h];
        if (v !== null && v !== undefined) metrics[h] = v instanceof Date ? v.toISOString().slice(0, 10) : v;
      }
      targets.set(codeKey, {
        codeKey,
        sheet: sheet.name,
        region,
        teamNote: get("teamNote"),
        excluded: info.role === "EXCLUDED",
        metrics: Object.keys(metrics).length ? metrics : null,
      });
    }
  }

  const blocking: string[] = [];
  if (!infos.some((i) => i.role !== "IGNORED")) {
    blocking.push(`ما لقينا عمود ${FIELDS.code.label} بأي ورقة. حدد العمود من خريطة الأعمدة.`);
  }

  // مقارنة مع قاعدة البيانات
  const keys = [...fileLines.keys()];
  const dbLines = await db.line.findMany({ where: { codeKey: { in: keys } } });
  const dbByKey = new Map(dbLines.map((l) => [l.codeKey, l]));
  const newLines: LineData[] = [];
  const changed: LineChange[] = [];
  for (const line of fileLines.values()) {
    const current = dbByKey.get(line.codeKey);
    if (!current) {
      newLines.push(line);
      continue;
    }
    const changes: LineChange["changes"] = {};
    for (const f of LINE_FIELDS) {
      // قيمة فاضية بالملف ما بتمسح قيمة موجودة
      if (line[f] !== null && line[f] !== current[f]) changes[f] = { from: current[f], to: line[f] };
    }
    if (current.manual) changes.manual = { from: true, to: false };
    if (Object.keys(changes).length) changed.push({ codeKey: line.codeKey, code: line.code ?? current.code, changes });
  }
  const missingFromFile = await db.line.count({ where: { inLatestFile: true, codeKey: { notIn: keys } } });
  const sameFile = await db.import.count({ where: { fileSha256 } });

  const targetList = [...targets.values()];
  return {
    month: opts.month,
    sheets: infos,
    blocking,
    problems,
    unknownLocalities: [...unknownLocalities].sort(),
    sameFileImportedBefore: sameFile > 0,
    fileSha256,
    lines: { new: newLines, changed, present: keys },
    targets: targetList,
    log,
    summary: {
      newLines: newLines.length,
      changedLines: changed.length,
      unchangedLines: fileLines.size - newLines.length - changed.length,
      missingFromFile,
      targets: targetList.length,
      excludedTargets: targetList.filter((t) => t.excluded).length,
      logRows: log.length,
      problems: problems.length,
    },
  };
}

// ───────────── الحفظ ─────────────

export async function applyMonthlyImport(
  actorId: string,
  buffer: Buffer,
  opts: { month: string; fileName: string; columnMap?: ColumnMap },
  db: Db = defaultPrisma,
): Promise<{ importId: string; summary: MonthlyPlan["summary"] }> {
  const plan = await analyzeMonthlyFile(buffer, opts, db);
  if (plan.blocking.length) throw new ApiError(400, plan.blocking.join(" "));

  const importId = await withAudit(
    actorId,
    async (tx, audit) => {
      const imp = await tx.import.create({
        data: {
          month: plan.month,
          fileName: opts.fileName.slice(0, 200),
          fileSha256: plan.fileSha256,
          importedById: actorId,
          stats: plan.summary,
        },
      });

      // الخطوط
      if (plan.lines.new.length) {
        await tx.line.createMany({
          data: plan.lines.new.map((l) => ({ ...l, code: l.code ?? l.codeKey, lastImportId: imp.id })),
        });
      }
      for (const ch of plan.lines.changed) {
        const data: Prisma.LineUpdateInput = { manual: false };
        for (const [f, v] of Object.entries(ch.changes))
          if (f !== "manual") (data as Record<string, unknown>)[f] = v.to;
        await tx.line.update({ where: { codeKey: ch.codeKey }, data });
      }
      await tx.line.updateMany({
        where: { codeKey: { in: plan.lines.present } },
        data: { inLatestFile: true, lastImportId: imp.id },
      });
      await tx.line.updateMany({
        where: { inLatestFile: true, codeKey: { notIn: plan.lines.present } },
        data: { inLatestFile: false },
      });

      const ids = new Map(
        (
          await tx.line.findMany({
            where: { codeKey: { in: plan.lines.present } },
            select: { id: true, codeKey: true },
          })
        ).map((l) => [l.codeKey, l.id]),
      );

      // زيارات الشهر: الشهر بينكتب من جديد كامل
      await tx.monthTarget.deleteMany({ where: { month: plan.month } });
      if (plan.targets.length) {
        await tx.monthTarget.createMany({
          data: plan.targets.map((t) => ({
            month: plan.month,
            lineId: ids.get(t.codeKey)!,
            sheet: t.sheet,
            region: t.region,
            teamNote: t.teamNote,
            excluded: t.excluded,
            metrics: t.metrics ?? undefined,
            importId: imp.id,
          })),
        });
      }

      // سجل الإدارة: تحديث أو إضافة حسب مفتاح الصف (الملف تراكمي)
      const existing = new Map(
        (await tx.managerLogEntry.findMany({ where: { rowKey: { in: plan.log.map((l) => l.rowKey) } } })).map((e) => [
          e.rowKey,
          e,
        ]),
      );
      const toCreate: Prisma.ManagerLogEntryCreateManyInput[] = [];
      for (const l of plan.log) {
        const row = {
          lineId: ids.get(l.codeKey)!,
          visitDate: l.visitDate,
          teamNote: l.teamNote,
          recommendation: l.recommendation,
          finalAction: l.finalAction,
          accountManager: l.accountManager,
          lastImportId: imp.id,
        };
        const prev = existing.get(l.rowKey);
        if (!prev) toCreate.push({ rowKey: l.rowKey, ...row });
        else if (
          prev.teamNote !== row.teamNote ||
          prev.recommendation !== row.recommendation ||
          prev.finalAction !== row.finalAction ||
          prev.accountManager !== row.accountManager
        ) {
          await tx.managerLogEntry.update({ where: { rowKey: l.rowKey }, data: row });
        }
      }
      if (toCreate.length) await tx.managerLogEntry.createMany({ data: toCreate });

      const s = plan.summary;
      audit.event(
        "IMPORT",
        "Import",
        imp.id,
        `ملف شهر ${plan.month} (${opts.fileName}): ${s.newLines} خط جديد، ${s.changedLines} تغيّرت بياناته، ${s.missingFromFile} مش موجود بالملف، ${s.targets} زيارة للشهر، ${s.logRows} سطر بسجل الإدارة، ${s.problems} صف فيه مشكلة`,
      );
      return imp.id;
    },
    db,
    { timeout: 120_000 },
  );
  return { importId, summary: plan.summary };
}
