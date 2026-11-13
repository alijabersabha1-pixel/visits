/** ملف زيارات قديم وهمي بنفس شكل ملف علي (Sheet1)، بدون بيانات حقيقية */
import ExcelJS from "exceljs";

const HEADERS = [
  "م.",
  "تاريخ الزيارة",
  "الحساب",
  "Line Code",
  "الفحوصات التي تمت طرف المشترك",
  "نتيجة الفحوصات",
  "🏠 الرئيسية",
  "Column6",
  "Column7",
];
const utc = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d));

export const LEGACY_ROWS: unknown[][] = [
  // الصف التاني بالملف الحقيقي: عناوين الأعمدة الأخيرة
  [null, null, null, null, null, null, "التوصية", "الاجراء المطبق", "اعاده الزيارة"],
  [
    1,
    "4/20/2026",
    "مقهى أ",
    "G-1000-001",
    "فحص حالة الخدمة",
    "يوجد إعادة بيع",
    "يوجد تجاوز",
    "تم تصويب الوضع",
    "يجب اعادة الزيارة",
  ],
  // صف مكمّل للزيارة 1
  [null, null, null, null, "فحص مكونات الشبكة", "تم فصل صندوق التوزيع", null, null, null],
  [2, "4/22/2026", "شركة ب", "g 2000 001", "فحص", "لا يوجد", "لا يوجد تجاوز", "لايوجد تجاوز بمعرفه مدير الحساب", null],
  // خلية تاريخ قلبها الإكسل: المقصود 11 مايو، انحفظت 5 نوفمبر
  [3, utc(2026, 11, 5), "مكتب ج", "G-3000-002", "فحص", "زيارة غير ناجحة", "زيارة غير ناجحه", "تم اعاده زيارة", null],
  [4, "5/12/2026", "زيارة لدمج خطوط شبكة", null, "فحص", "حالة خاصة", "فحص شبكات", null, null],
  [5, "5/13/2026", "شبكة الهدى", "-", null, null, "اعاده الزياره", null, "لم يظهر في تقرير شهر 9"],
  // رقم مكرر (موجود بالملف الحقيقي)
  [5, "5/14/2026", "مقهى أ", "G-1000-001", "فحص تاني", null, "لا يوجد تجاوز", null, null],
];

export async function buildLegacyFile(rows = LEGACY_ROWS): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Sheet1");
  ws.addRow(HEADERS);
  for (const r of rows) ws.addRow(r);
  wb.addWorksheet("All Visits").addRow(["نظام البحث"]);
  return Buffer.from(await wb.xlsx.writeBuffer());
}
