/**
 * نقل الزيارات القديمة من الإكسل.
 *
 *   npm run import:legacy -- visits.xlsx            ← معاينة بس + تقرير مراجعة (ما بيحفظ شي)
 *   npm run import:legacy -- visits.xlsx --apply    ← الحفظ الفعلي (بعد ما علي يوافق على التقرير)
 *
 * التقرير بينكتب بمجلد legacy-review/ جنب المشروع: review.md و doubtful.csv و special-cases.csv
 * التشغيل أكتر من مرة آمن: ما بيكرر، وبيحدّث الزيارة إذا تصححت بالإكسل.
 */
import "dotenv/config";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { createPrisma } from "../lib/db";
import { analyzeLegacyFile, applyLegacyImport, type LegacyPlan } from "../lib/import/legacy";
import { csv } from "../lib/csv";

export function renderReport(plan: LegacyPlan, fileName: string): string {
  const s = plan.summary;
  const lines = [
    `# تقرير مراجعة نقل الزيارات القديمة`,
    ``,
    `الملف: ${fileName} · الورقة: ${plan.sheet} · ${new Date().toISOString().slice(0, 10)}`,
    ``,
    `| | العدد |`,
    `| --- | --- |`,
    `| زيارات | ${s.visits} |`,
    `| صفوف مكمّلة اندمجت بالزيارة اللي فوقها | ${s.mergedRows} |`,
    `| حالات خاصة (بدون Line Code صالح) | ${s.specialCases} |`,
    `| تواريخ بدها مراجعة | ${s.doubtfulDates} |`,
    `| أرقام زيارات مكررة | ${plan.duplicateNumbers.length} |`,
    `| أكبر رقم زيارة (الجديدة بتكمل بعده) | ${s.maxNumber} |`,
    ``,
    `## التواريخ`,
    ``,
    `| الطريقة | العدد |`,
    `| --- | --- |`,
    ...Object.entries(
      plan.visits.reduce<Record<string, number>>(
        (acc, v) => ((acc[v.dateMethod] = (acc[v.dateMethod] ?? 0) + 1), acc),
        {},
      ),
    ).map(
      ([m, n]) =>
        `| ${{ text: "نص شهر/يوم (متل ما هو)", swapped: "خلية قلبها الإكسل (انقلبت)", unswappable: "خلية ما بتنقلب", invalid: "مش مفهوم" }[m] ?? m} | ${n} |`,
    ),
    ``,
    plan.doubtful.length
      ? `تواريخ بدها مراجعة: شوف doubtful.csv (${plan.doubtful.length}).`
      : `ولا تاريخ بده مراجعة: كل التواريخ بترتيب الصفوف.`,
    ``,
    `## التوصية بعد التوحيد`,
    ``,
    `| التوصية | العدد |`,
    `| --- | --- |`,
    ...Object.entries(plan.recommendationCounts)
      .sort((a, b) => b[1] - a[1])
      .map(([k, n]) => `| ${k} | ${n} |`),
    ``,
    `## قيم ما إلها مقابل بالقوائم`,
    ``,
    plan.unknownValues.length
      ? [
          `بتنضاف كقيم موقوفة: بتظهر بالزيارات القديمة، وما بتظهر بالزيارات الجديدة. إذا إلها مقابل بالقائمة احكيلي وبنوحدها.`,
          ``,
          `| القائمة | القيمة | العدد |`,
          `| --- | --- | --- |`,
          ...plan.unknownValues.map(
            (u) => `| ${u.kind === "ACTION" ? "الإجراء" : "التوصية"} | ${u.label} | ${u.count} |`,
          ),
        ].join("\n")
      : `ولا وحدة.`,
    ``,
    `## أرقام زيارات مكررة`,
    ``,
    plan.duplicateNumbers.length
      ? [
          `الزيارات بتنحفظ كلها، كل وحدة لحالها. الرقم بس مكرر.`,
          ``,
          `| الرقم | الصفوف بالإكسل |`,
          `| --- | --- |`,
          ...plan.duplicateNumbers.map((d) => `| ${d.number} | ${d.rows.join("، ")} |`),
        ].join("\n")
      : `ولا رقم.`,
    ``,
  ];
  return lines.join("\n");
}

async function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: { apply: { type: "boolean", default: false }, out: { type: "string", default: "legacy-review" } },
  });
  const file = positionals[0];
  if (!file) {
    console.error("الاستخدام: npm run import:legacy -- visits.xlsx [--apply]");
    process.exit(1);
  }
  const buffer = readFileSync(file);
  const fileName = path.basename(file);
  const db = createPrisma();
  try {
    const today = new Date();
    let plan: LegacyPlan;
    if (values.apply) {
      const r = await applyLegacyImport(buffer, { today, fileName }, db);
      plan = r.plan;
      console.log(`جديدة: ${r.created} · تحدّثت: ${r.updated} · ما تغيّرت: ${r.unchanged}`);
    } else {
      plan = await analyzeLegacyFile(buffer, { today }, db);
    }
    mkdirSync(values.out!, { recursive: true });
    writeFileSync(path.join(values.out!, "review.md"), renderReport(plan, fileName));
    writeFileSync(
      path.join(values.out!, "doubtful.csv"),
      csv([
        ["رقم الزيارة", "الصف بالإكسل", "التاريخ بالإكسل", "السبب"],
        ...plan.doubtful.map((d) => [d.number, d.row, d.dateText, d.reason]),
      ]),
    );
    writeFileSync(
      path.join(values.out!, "special-cases.csv"),
      csv([
        ["رقم الزيارة", "الصف بالإكسل", "الاسم", "الكود بالإكسل"],
        ...plan.specialCases.map((c) => [c.number, c.row, c.accountName, c.lineCode]),
      ]),
    );
    console.log(values.apply ? "انحفظت الزيارات." : "معاينة بس، ما انحفظ شي. للحفظ: --apply");
    console.log(plan.summary);
    console.log(`التقرير: ${path.join(values.out!, "review.md")}`);
  } finally {
    await db.$disconnect();
  }
}

main().catch((err) => {
  console.error(err?.message ?? err);
  process.exit(1);
});
