/**
 * تصدير الزيارات والبطاقات إلى Excel. نفس أعمدة ملف الإكسل الحالي أول، وبعدها الأعمدة الجديدة.
 * الـ PDF بينطبع من صفحات /print (lib/export/pdf.ts).
 */
import ExcelJS from "exceljs";
import { prisma as defaultPrisma, type Db } from "../db";
import { visitWhere, type VisitFilters } from "../visit-list";
import { cardMonthly } from "../cards";
import { TIME_ZONE } from "../dates";

export const MAX_EXPORT = 5000;
const UUID = /^[0-9a-f-]{36}$/i;

const include = {
  recommendation: { select: { label: true } },
  action: { select: { label: true } },
  owner: { select: { displayName: true } },
  line: { select: { region: true, accountName: true, code: true, speed: true } },
} as const;

export type ExportVisit = Awaited<ReturnType<typeof exportVisits>>[number];

/** الزيارات المحددة (ids)، أو كل نتيجة الفلتر. المحذوفة ما بتطلع. الأحدث أول. */
export async function exportVisits(sel: { ids?: string[]; filters?: VisitFilters }, db: Db = defaultPrisma) {
  const ids = sel.ids?.filter((i) => UUID.test(i)).slice(0, MAX_EXPORT);
  const where = ids?.length ? { id: { in: ids }, deletedAt: null } : visitWhere(sel.filters ?? {});
  const rows = await db.visit.findMany({
    where,
    orderBy: [{ visitedOn: "desc" }, { number: "desc" }],
    take: MAX_EXPORT,
    include,
  });
  const companionIds = [...new Set(rows.flatMap((r) => r.companionIds))];
  const names = new Map(
    (await db.user.findMany({ where: { id: { in: companionIds } }, select: { id: true, displayName: true } })).map((u) => [
      u.id,
      u.displayName,
    ]),
  );
  return rows.map((r) => ({
    ...r,
    companions: r.companionIds.map((id) => names.get(id)).filter(Boolean).join("، "),
  }));
}

const dayCell = (d: Date | null) => (d ? new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())) : null);

export const VISIT_COLUMNS: Array<{ header: string; width: number; value: (v: ExportVisit) => unknown }> = [
  // نفس ترتيب ملف الإكسل الحالي
  { header: "م.", width: 7, value: (v) => v.number },
  { header: "التاريخ", width: 12, value: (v) => dayCell(v.visitedOn) },
  { header: "الحساب", width: 30, value: (v) => v.accountName ?? v.line?.accountName ?? "" },
  { header: "الكود", width: 14, value: (v) => (v.specialCase ? "حالة خاصة" : (v.line?.code ?? v.lineCode ?? "")) },
  { header: "الفحوصات", width: 40, value: (v) => v.tests ?? "" },
  { header: "النتيجة", width: 40, value: (v) => v.result ?? "" },
  { header: "التوصية", width: 18, value: (v) => v.recommendation?.label ?? "" },
  { header: "الإجراء", width: 24, value: (v) => v.action?.label ?? "" },
  { header: "إعادة الزيارة", width: 20, value: (v) => v.revisitNote ?? dayCell(v.revisitDue) ?? "" },
  // الأعمدة الجديدة
  { header: "السفير", width: 16, value: (v) => v.owner?.displayName ?? "غير محدد" },
  { header: "المرافقين", width: 18, value: (v) => v.companions },
  { header: "المنطقة", width: 10, value: (v) => v.line?.region ?? "" },
  { header: "المكان", width: 20, value: (v) => v.place ?? "" },
  { header: "الموقع", width: 22, value: (v) => (v.lat !== null && v.lng !== null ? `${v.lat.toFixed(5)}, ${v.lng.toFixed(5)}` : "") },
  { header: "رابط الخريطة", width: 16, value: (v) => (v.lat !== null && v.lng !== null ? `https://www.openstreetmap.org/?mlat=${v.lat}&mlon=${v.lng}#map=18/${v.lat}/${v.lng}` : "") },
];

function styleSheet(ws: ExcelJS.Worksheet) {
  ws.views = [{ rightToLeft: true, state: "frozen", ySplit: 1 }];
  const head = ws.getRow(1);
  head.font = { bold: true, color: { argb: "FFFFFFFF" } };
  head.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF115D92" } };
  head.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
  head.height = 22;
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: ws.columnCount } };
}

export async function visitsWorkbook(rows: ExportVisit[]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "نظام زيارات السفراء";
  const ws = wb.addWorksheet("الزيارات");
  ws.columns = VISIT_COLUMNS.map((c) => ({ header: c.header, width: c.width }));
  for (const v of rows) ws.addRow(VISIT_COLUMNS.map((c) => c.value(v)));
  ws.getColumn(2).numFmt = "yyyy-mm-dd";
  ws.getColumn(9).numFmt = "yyyy-mm-dd";
  for (const k of [5, 6]) ws.getColumn(k).alignment = { wrapText: true, vertical: "top" };
  styleSheet(ws);
  return Buffer.from(await wb.xlsx.writeBuffer());
}

const LINK_LABEL: Record<string, string> = { VISIT: "زيارة", EXTERNAL: "فحص خارجي", VPN: "حالة VPN", NONE: "" };
const timeFmt = new Intl.DateTimeFormat("en-GB", { timeZone: TIME_ZONE, hour: "2-digit", minute: "2-digit" });
const dayFmt = new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE });

/** تقرير آخر الشهر للصرف: كل بطاقة بتفاصيلها، وبالآخر المجموع لكل سفير والمجموع الكلي */
export async function cardsWorkbook(opts: { month: string; ownerId?: string }, db: Db = defaultPrisma): Promise<Buffer> {
  const r = await cardMonthly(opts, db);
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(`البطاقات ${opts.month}`);
  ws.columns = [
    { header: "التاريخ", width: 12 },
    { header: "الوقت", width: 8 },
    { header: "البطاقة أو الشبكة", width: 26 },
    { header: "IP", width: 16 },
    { header: "السعر (₪)", width: 11 },
    { header: "مرتبطة بـ", width: 12 },
    { header: "السفير", width: 16 },
  ];
  for (const c of r.rows) {
    ws.addRow([
      dayFmt.format(c.filledAt),
      timeFmt.format(c.filledAt),
      c.name,
      c.ip ?? "",
      Number(c.price),
      LINK_LABEL[c.linkKind] ?? "",
      c.owner.displayName,
    ]);
  }
  ws.getColumn(5).numFmt = "#,##0.00";
  ws.addRow([]);
  for (const o of r.byOwner) {
    const row = ws.addRow(["", "", `مجموع ${o.name} (${o.count} بطاقة)`, "", o.total]);
    row.font = { bold: true };
  }
  const total = ws.addRow(["", "", "المجموع", "", r.total]);
  total.font = { bold: true };
  total.getCell(5).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEEF7E7" } };
  styleSheet(ws);
  ws.autoFilter = undefined as unknown as ExcelJS.AutoFilter;
  return Buffer.from(await wb.xlsx.writeBuffer());
}
