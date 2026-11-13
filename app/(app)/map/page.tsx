import type { Metadata } from "next";
import Link from "next/link";
import { requirePermission } from "@/lib/session";
import { formOptions } from "@/lib/form-options";
import { MapView } from "@/components/MapView";

export const metadata: Metadata = { title: "الخريطة" };

const REGIONS = ["غزة", "الوسطى", "الجنوب"];
type Search = { region?: string; rec?: string; from?: string; to?: string; owner?: string; vpn?: string };

export default async function MapPage({ searchParams }: { searchParams: Promise<Search> }) {
  await requirePermission("stats:view");
  const sp = await searchParams;
  const opts = await formOptions();
  const q = new URLSearchParams();
  for (const k of ["region", "rec", "from", "to", "owner"] as const) if (sp[k]) q.set(k, sp[k]!);
  const showVpn = sp.vpn !== "0";

  return (
    <>
      <div className="page-head">
        <div>
          <h1>الخريطة</h1>
          <p className="muted">دبوس لكل خط من آخر زيارة فيها موقع، ولونه حسب آخر توصية.</p>
        </div>
      </div>

      <div className="card">
        <form className="filters form-grid" method="get">
          <div className="field">
            <label htmlFor="region">المنطقة</label>
            <select id="region" name="region" className="select" defaultValue={sp.region ?? ""}>
              <option value="">الكل</option>
              {REGIONS.map((r) => (
                <option key={r}>{r}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="rec">آخر توصية</label>
            <select id="rec" name="rec" className="select" defaultValue={sp.rec ?? ""}>
              <option value="">الكل</option>
              {opts.recommendations.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.label}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="from">من تاريخ</label>
            <input id="from" name="from" type="date" className="input" defaultValue={sp.from ?? ""} />
          </div>
          <div className="field">
            <label htmlFor="to">لتاريخ</label>
            <input id="to" name="to" type="date" className="input" defaultValue={sp.to ?? ""} />
          </div>
          <div className="field">
            <label htmlFor="owner">السفير</label>
            <select id="owner" name="owner" className="select" defaultValue={sp.owner ?? ""}>
              <option value="">الكل</option>
              {opts.users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.displayName}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="vpn">طبقة VPN</label>
            <select id="vpn" name="vpn" className="select" defaultValue={showVpn ? "1" : "0"}>
              <option value="1">ظاهرة</option>
              <option value="0">مخفية</option>
            </select>
          </div>
          <div className="actions">
            <button className="btn btn-primary" type="submit">
              عرض
            </button>
            <Link className="btn btn-ghost" href="/map">
              مسح
            </Link>
          </div>
        </form>
        <div className="legend" style={{ padding: "12px 20px 0" }} aria-label="مفتاح الألوان">
          {opts.recommendations.map((r) => (
            <span key={r.id} className="legend-item">
              <span className="swatch" style={{ background: r.color ?? "#7a8693", borderRadius: "50%" }} aria-hidden="true" />
              {r.label}
            </span>
          ))}
          {showVpn && (
            <span className="legend-item">
              <span className="swatch" style={{ background: "#17212b", borderRadius: "50%" }} aria-hidden="true" />
              حالة VPN
            </span>
          )}
        </div>
        <div className="card-pad">
          <MapView query={q.toString()} showVpn={showVpn} />
        </div>
      </div>
    </>
  );
}
