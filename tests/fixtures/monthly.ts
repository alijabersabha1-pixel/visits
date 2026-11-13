/**
 * ملف شهر وهمي بنفس شكل ملف المسؤول الحقيقي (أوراق وأعمدة)، بدون بيانات مشتركين حقيقية.
 */
import ExcelJS from "exceljs";

type Row = Record<string, unknown>;

const LOG_HEADERS = [
  "Account Manager",
  "Line_Code",
  "speed",
  "account name",
  "Locality",
  "ملاحظات الفريق",
  "تاريخ الزياره",
  "التوصية",
  "الاجراء النهائي لمدير المنطقة بقطاع الاعمال",
];

const TARGET_HEADERS = [
  "Account Manager",
  "Line_Code",
  "speed",
  "account name",
  "Locality",
  "ملاحظات الفريق",
  "تاريخ الزياره",
  "Data Speed",
  "Utilization Avg",
  "Fixed Ip",
  "Total Out",
  "Addr Locality",
  "Addr Quarter",
];

export const LOG_ROWS: Row[] = [
  {
    "Account Manager": "AM.ONE",
    Line_Code: "G-1000-001",
    speed: "Filine 200 Mbps",
    "account name": "مقهى الاختبار",
    Locality: "خانيونس",
    "ملاحظات الفريق": "ملتزم",
    "تاريخ الزياره": new Date(Date.UTC(2026, 8, 30)),
    التوصية: "لا يوجد تجاوز",
    "الاجراء النهائي لمدير المنطقة بقطاع الاعمال": "لا يوجد تجاوز",
  },
  {
    "Account Manager": "AM.TWO",
    Line_Code: "G-2000-001",
    speed: "iFiber 500 Mbps",
    "account name": "شركة تجريبية",
    Locality: "الوسطي",
    "ملاحظات الفريق": "إعادة بيع",
    "تاريخ الزياره": "14/09/2026",
    التوصية: "تصويب الوضع",
    "الاجراء النهائي لمدير المنطقة بقطاع الاعمال": "تم تصويب الوضع + تعهد عدلي",
  },
  // نفس الخط ونفس التاريخ مرتين (موجود بالملف الحقيقي)
  {
    Line_Code: "G-2000-001",
    "account name": "شركة تجريبية",
    Locality: "الوسطي",
    "تاريخ الزياره": "14/09/2026",
    التوصية: "اعاده الزياره",
  },
  { Line_Code: "-", "account name": "شبكة بدون كود" },
];

export const TARGET_ROWS: Row[] = [
  {
    "Account Manager": "AM.ONE",
    Line_Code: "G-1000-001",
    speed: "Filine 200 Mbps",
    "account name": "مقهى الاختبار",
    Locality: "خانيونس",
    "ملاحظات الفريق": "#N/A",
    "Data Speed": "200",
    "Utilization Avg": 45.8,
    "Fixed Ip": "213.6.237.181",
    "Total Out": 15605.15,
    "Addr Locality": "البلد",
    "Addr Quarter": "وسط البلد",
  },
  {
    "Account Manager": "AM.THREE",
    Line_Code: "G-3000-002",
    speed: "FWA - 50 Mbps",
    "account name": "خط جديد",
    Locality: "غزة",
    "Fixed Ip": "66.9.17.185",
  },
  { Line_Code: "G-3000-002", "account name": "مكرر بنفس الورقة" },
];

export const EXCLUDED_ROWS: Row[] = [
  { Line_Code: "G-4000-001", "account name": "مستثنى", Locality: "غزة", "ملاحظات الفريق": "عدم الزيارة لاسباب خاصة" },
];

function addSheet(wb: ExcelJS.Workbook, name: string, headers: string[], rows: Row[]) {
  const ws = wb.addWorksheet(name);
  ws.addRow(headers);
  for (const r of rows) ws.addRow(headers.map((h) => r[h] ?? null));
}

export async function buildMonthlyFile(
  opts: { log?: Row[]; targets?: Row[]; excluded?: Row[]; regionSheet?: Row[] } = {},
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  addSheet(wb, "الزيارات الإجماليه", LOG_HEADERS, opts.log ?? LOG_ROWS);
  addSheet(wb, "زيارات جديدة", TARGET_HEADERS, opts.targets ?? TARGET_ROWS);
  if (opts.regionSheet) addSheet(wb, "زيارات خانيونس", TARGET_HEADERS, opts.regionSheet);
  addSheet(wb, "استثناء من الزيارات", TARGET_HEADERS, opts.excluded ?? EXCLUDED_ROWS);
  const summary = wb.addWorksheet("ملخص الزيارات");
  summary.addRow([]);
  summary.addRow(["توصية الزيارة", "عدد الزيارات"]);
  return Buffer.from(await wb.xlsx.writeBuffer());
}
