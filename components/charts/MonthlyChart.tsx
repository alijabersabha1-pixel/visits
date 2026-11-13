"use client";

/**
 * عدد الزيارات شهرياً، مقسوم حسب التوصية (أعمدة مكدّسة، آخر 12 شهر).
 * ترتيب الطبقات ثابت ومفحوص لعمى الألوان: التجاوز على الأساس، وبعده فحص شبكة، لا يوجد تجاوز،
 * غير ناجحة، إعادة زيارة. الألوان من القوائم (نفس ألوان دبابيس الخريطة).
 */
import { useEffect, useRef, useState } from "react";

type Part = { label: string; color: string | null; count: number };
type Month = { month: string; total: number; parts: Part[] };

const ORDER = ["يوجد تجاوز", "فحص شبكة", "لا يوجد تجاوز", "زيارة غير ناجحة", "إعادة زيارة"];
const OTHER = "#c9d1d9";
const LEGACY = "قيم قديمة";

const monthFmt = new Intl.DateTimeFormat("ar-PS-u-nu-latn", { month: "short", timeZone: "UTC" });
const monthLong = new Intl.DateTimeFormat("ar-PS-u-nu-latn", { month: "long", year: "numeric", timeZone: "UTC" });
const label = (m: string, narrow = false) =>
  narrow ? `${Number(m.slice(5))}/${m.slice(2, 4)}` : monthFmt.format(new Date(`${m}-01T00:00:00Z`));

function niceMax(n: number) {
  if (n <= 5) return 5;
  const p = 10 ** Math.floor(Math.log10(n));
  const s = [1, 2, 2.5, 5, 10].find((k) => k * p >= n)!;
  return s * p;
}

/** عرض الحاوية الفعلي، عشان الرسم ينرسم بحجمه الحقيقي والنص يضل مقروء على الجوال */
function useWidth() {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(720);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.round(e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

export function MonthlyChart({ months: input }: { months: Month[] }) {
  const [ref, width] = useWidth();
  // على الشاشات الضيقة: آخر 6 أشهر بس (الجدول تحت فيه الـ 12)
  const all = input;
  let months = width < 520 ? input.slice(-6) : input;
  const [hover, setHover] = useState<number | null>(null);
  // التوصيات الخمسة بترتيبها الثابت. أي قيمة تانية (قديمة أو موقوفة) بتنضم لـ«قيم قديمة» بلون محايد،
  // عشان ما يطلع لونين متشابهين بمعنيين مختلفين.
  months = fold(months);
  const seen = new Map<string, string>();
  for (const m of fold(all)) for (const p of m.parts) if (!seen.has(p.label)) seen.set(p.label, p.color ?? OTHER);
  const series = [...ORDER, LEGACY].filter((s) => seen.has(s));

  const W = Math.max(280, width);
  const H = width < 520 ? 220 : 260;
  const pad = { top: 12, right: 40, bottom: 28, left: 8 };
  const max = niceMax(Math.max(1, ...months.map((m) => m.total)));
  const plotW = W - pad.left - pad.right;
  const plotH = H - pad.top - pad.bottom;
  const slot = plotW / months.length;
  const barW = Math.min(34, slot * 0.6);
  const y = (v: number) => pad.top + plotH - (v / max) * plotH;
  const ticks = [0, max / 2, max];
  // RTL: الأقدم على اليمين والأحدث على الشمال
  const x = (i: number) => pad.left + plotW - slot * (i + 1) + (slot - barW) / 2;

  const h = hover !== null ? months[hover] : null;

  return (
    <div className="chart">
      <div className="legend" aria-label="مفتاح الألوان">
        {series.map((s) => (
          <span key={s} className="legend-item">
            <span className="swatch" style={{ background: seen.get(s) }} aria-hidden="true" />
            {s}
          </span>
        ))}
      </div>
      <div className="chart-plot" ref={ref} onMouseLeave={() => setHover(null)}>
        <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} role="img" aria-label={`عدد الزيارات شهرياً حسب التوصية، آخر ${months.length} شهر`}>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={pad.left} x2={pad.left + plotW} y1={y(t)} y2={y(t)} className="grid-line" />
              <text x={W - pad.right + 6} y={y(t) + 4} className="axis-text" textAnchor="start">
                {t}
              </text>
            </g>
          ))}
          {months.map((m, i) => {
            let acc = 0;
            const segs = series
              .map((s) => ({ s, n: m.parts.find((p) => p.label === s)?.count ?? 0 }))
              .filter((p) => p.n > 0);
            return (
              <g key={m.month} opacity={hover === null || hover === i ? 1 : 0.45}>
                {segs.map((p, j) => {
                  const y0 = y(acc);
                  acc += p.n;
                  const y1 = y(acc);
                  const top = j === segs.length - 1;
                  // فراغ 2px بين الطبقات
                  const hgt = Math.max(0, y0 - y1 - (j > 0 ? 2 : 0));
                  return (
                    <path
                      key={p.s}
                      d={roundedTop(x(i), y1, barW, hgt, top ? 4 : 0)}
                      fill={seen.get(p.s)}
                    />
                  );
                })}
                <text x={x(i) + barW / 2} y={H - 8} textAnchor="middle" className="axis-text">
                  {label(m.month, slot < 60)}
                </text>
                {/* منطقة تمرير أكبر من العمود */}
                <rect
                  x={pad.left + plotW - slot * (i + 1)}
                  y={pad.top}
                  width={slot}
                  height={plotH}
                  fill="transparent"
                  onMouseEnter={() => setHover(i)}
                  onFocus={() => setHover(i)}
                  onClick={() => setHover(i)}
                  tabIndex={0}
                  aria-label={`${monthLong.format(new Date(`${m.month}-01T00:00:00Z`))}: ${m.total} زيارة`}
                />
              </g>
            );
          })}
        </svg>
        {h && hover !== null && (
          <div
            className="tooltip"
            role="status"
            // جنب العمود: إذا العمود بالنص اليمين، التلميح على شماله، والعكس
            style={
              x(hover) + barW / 2 > W / 2
                ? { top: 8, left: Math.max(0, x(hover) - 196), right: "auto" }
                : { top: 8, left: Math.min(W - 190, x(hover) + barW + 8), right: "auto" }
            }
          >
            <b>{monthLong.format(new Date(`${h.month}-01T00:00:00Z`))}</b>
            <div className="tooltip-total">{h.total} زيارة</div>
            {series
              .map((s) => ({ s, n: h.parts.find((p) => p.label === s)?.count ?? 0 }))
              .filter((p) => p.n > 0)
              .reverse()
              .map((p) => (
                <div key={p.s} className="tooltip-row">
                  <span className="swatch" style={{ background: seen.get(p.s) }} aria-hidden="true" />
                  <span>{p.s}</span>
                  <b className="ltr">{p.n}</b>
                </div>
              ))}
          </div>
        )}
      </div>
      <details className="table-view">
        <summary className="small">عرض كجدول</summary>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>الشهر</th>
                {series.map((s) => (
                  <th key={s}>{s}</th>
                ))}
                <th>المجموع</th>
              </tr>
            </thead>
            <tbody>
              {[...fold(all)].reverse().map((m) => (
                <tr key={m.month}>
                  <td>{monthLong.format(new Date(`${m.month}-01T00:00:00Z`))}</td>
                  {series.map((s) => (
                    <td key={s}>{m.parts.find((p) => p.label === s)?.count ?? 0}</td>
                  ))}
                  <td>
                    <b>{m.total}</b>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}

function fold(months: Month[]): Month[] {
  return months.map((m) => {
    const known = m.parts.filter((p) => ORDER.includes(p.label));
    const rest = m.parts.filter((p) => !ORDER.includes(p.label)).reduce((s, p) => s + p.count, 0);
    return { ...m, parts: rest ? [...known, { label: LEGACY, color: OTHER, count: rest }] : known };
  });
}

/** مستطيل زواياه العلوية مدوّرة بس (الأساس مثبّت على الخط) */
function roundedTop(x: number, y: number, w: number, h: number, r: number) {
  if (h <= 0) return "";
  const rr = Math.min(r, h, w / 2);
  return `M${x},${y + h}V${y + rr}Q${x},${y} ${x + rr},${y}H${x + w - rr}Q${x + w},${y} ${x + w},${y + rr}V${y + h}Z`;
}
