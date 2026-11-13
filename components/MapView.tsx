"use client";

/**
 * الخريطة: Leaflet + OpenStreetMap (مجاني، بدون مفتاح).
 * دبوس لكل خط بلون آخر توصية، والدبابيس المتقاربة بتتجمع بدائرة فيها رقم.
 * التمرير بيعرض الاسم والكود والعدد وآخر زيارة، والنقر بيفتح لوحة جانبية.
 */
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import "leaflet/dist/leaflet.css";
import "leaflet.markercluster/dist/MarkerCluster.css";
import type { MapData, MapPin } from "@/lib/map";

type Panel = {
  codeKey: string;
  line: {
    code: string;
    accountName: string | null;
    speed: string | null;
    fixedIp: string | null;
    region: string | null;
    locality: string | null;
    accountManager: string | null;
  } | null;
  total: number;
  visits: Array<{ id: string; day: string | null; owner: string | null; rec: string | null; color: string | null; action: string | null }>;
};

const GAZA: [number, number] = [31.42, 34.37];
const NO_REC = "#7a8693";

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

function pinIcon(L: typeof import("leaflet"), color: string) {
  return L.divIcon({
    className: "pin",
    html: `<span style="background:${color}"></span>`,
    iconSize: [22, 22],
    iconAnchor: [11, 11],
  });
}

export function MapView({ query, showVpn }: { query: string; showVpn: boolean }) {
  const el = useRef<HTMLDivElement>(null);
  const mapRef = useRef<import("leaflet").Map | null>(null);
  const layerRef = useRef<import("leaflet").LayerGroup | null>(null);
  const [data, setData] = useState<MapData | null>(null);
  const [error, setError] = useState("");
  const [panel, setPanel] = useState<Panel | null>(null);
  const [panelPin, setPanelPin] = useState<MapPin | null>(null);

  // البيانات
  useEffect(() => {
    let stop = false;
    fetch(`/api/map?${query}`, { credentials: "same-origin" })
      .then(async (r) => {
        if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? "ما قدرنا نجيب بيانات الخريطة");
        return r.json() as Promise<MapData>;
      })
      .then((d) => !stop && setData(d))
      .catch((e: Error) => !stop && setError(e.message));
    return () => {
      stop = true;
    };
  }, [query]);

  // الخريطة نفسها (مرة وحدة)
  useEffect(() => {
    let disposed = false;
    (async () => {
      const L = (await import("leaflet")).default;
      await import("leaflet.markercluster");
      if (disposed || !el.current || mapRef.current) return;
      const map = L.map(el.current, { zoomControl: true, attributionControl: true }).setView(GAZA, 11);
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      }).addTo(map);
      mapRef.current = map;
      layerRef.current = L.layerGroup().addTo(map);
    })();
    return () => {
      disposed = true;
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  // الدبابيس
  useEffect(() => {
    if (!data) return;
    let cancelled = false;
    (async () => {
      const L = (await import("leaflet")).default;
      await import("leaflet.markercluster");
      // الخريطة ممكن تكون لسا عم تنبني
      for (let i = 0; i < 50 && !layerRef.current; i++) await new Promise((r) => setTimeout(r, 50));
      const group = layerRef.current;
      const map = mapRef.current;
      if (cancelled || !group || !map) return;
      group.clearLayers();
      const cluster = L.markerClusterGroup({ showCoverageOnHover: false, maxClusterRadius: 45 });
      const bounds: [number, number][] = [];
      for (const p of data.pins) {
        const m = L.marker([p.lat, p.lng], { icon: pinIcon(L, p.color ?? NO_REC), title: p.code, keyboard: true });
        m.bindTooltip(
          `<b>${esc(p.name ?? "—")}</b><br><span dir="ltr">${esc(p.code)}</span><br>${p.visits} زيارة · آخر زيارة ${esc(
            p.lastVisitOn ?? "—",
          )}${p.lastRec ? ` · ${esc(p.lastRec)}` : ""}`,
          { direction: "top", offset: [0, -10] },
        );
        m.on("click", () => setPanelPin(p));
        cluster.addLayer(m);
        bounds.push([p.lat, p.lng]);
      }
      group.addLayer(cluster);
      if (showVpn) {
        for (const v of data.vpn) {
          const m = L.circleMarker([v.lat, v.lng], {
            radius: 7,
            color: "#ffffff",
            weight: 2,
            fillColor: "#17212b",
            fillOpacity: 0.9,
          });
          m.bindTooltip(
            `<b>VPN: ${esc(v.networkName)}</b><br><span dir="ltr">${esc(v.ip)}</span><br>${esc(v.day)} · ${esc(v.owner)}`,
            { direction: "top" },
          );
          group.addLayer(m);
          bounds.push([v.lat, v.lng]);
        }
      }
      if (bounds.length) map.fitBounds(bounds, { padding: [30, 30], maxZoom: 15 });
    })();
    return () => {
      cancelled = true;
    };
  }, [data, showVpn]);

  // اللوحة الجانبية: بيانات الخط وآخر زياراته
  useEffect(() => {
    if (!panelPin) return;
    let stop = false;
    fetch(`/api/map/line?code=${encodeURIComponent(panelPin.code)}`, { credentials: "same-origin" })
      .then((r) => (r.ok ? (r.json() as Promise<Panel>) : null))
      .then((d) => !stop && setPanel(d && d.codeKey === panelPin.codeKey ? d : null))
      .catch(() => {});
    return () => {
      stop = true;
    };
  }, [panelPin]);

  const shown = panel && panelPin && panel.codeKey === panelPin.codeKey ? panel : null;

  return (
    <div className="map-wrap">
      <div className="map-meta small">
        {error ? (
          <span className="warn-text">{error}</span>
        ) : data ? (
          <>
            <span>
              <b data-testid="pin-count">{data.pins.length}</b> خط على الخريطة
            </span>
            <span>
              <b data-testid="no-location">{data.withoutLocation}</b> خط لسا ما إله موقع
            </span>
            {showVpn && (
              <span>
                <b>{data.vpn.length}</b> حالة VPN
              </span>
            )}
          </>
        ) : (
          <span className="muted">عم نحمّل…</span>
        )}
      </div>
      <div className="map-body">
        <div ref={el} className="map" role="region" aria-label="الخريطة" />
        {panelPin && (
          <aside className="map-panel card" aria-label="تفاصيل الخط">
            <div className="card-head">
              <h2 style={{ fontSize: 16 }}>{shown?.line?.accountName ?? panelPin.name ?? "—"}</h2>
              <button className="btn btn-ghost btn-sm" onClick={() => setPanelPin(null)} aria-label="إغلاق">
                ✕
              </button>
            </div>
            <div className="card-pad grid" style={{ gap: 12 }}>
              <dl className="kv">
                <div>
                  <dt>Line Code</dt>
                  <dd className="ltr">{shown?.line?.code ?? panelPin.code}</dd>
                </div>
                <div>
                  <dt>السرعة</dt>
                  <dd>{shown?.line?.speed ?? panelPin.speed ?? "—"}</dd>
                </div>
                <div>
                  <dt>IP</dt>
                  <dd className="ltr">{shown?.line?.fixedIp ?? "—"}</dd>
                </div>
                <div>
                  <dt>المنطقة</dt>
                  <dd>{[shown?.line?.region ?? panelPin.region, shown?.line?.locality].filter(Boolean).join(" · ") || "—"}</dd>
                </div>
                {shown?.line?.accountManager && (
                  <div>
                    <dt>مدير الحساب</dt>
                    <dd>{shown.line.accountManager}</dd>
                  </div>
                )}
              </dl>
              <div>
                <div className="small muted" style={{ marginBottom: 6 }}>
                  الزيارات ({shown?.total ?? panelPin.visits})
                </div>
                {!shown ? (
                  <div className="small muted">عم نحمّل…</div>
                ) : (
                  <ul className="alert-list">
                    {shown.visits.map((v) => (
                      <li key={v.id}>
                        <Link href={`/visits/${v.id}`} className="ltr">
                          {v.day ?? "—"}
                        </Link>{" "}
                        {v.rec && (
                          <span className="legend-item small">
                            <span className="swatch" style={{ background: v.color ?? NO_REC }} aria-hidden="true" />
                            {v.rec}
                          </span>
                        )}
                        <span className="muted small"> {v.owner ?? "غير محدد"}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <Link className="btn btn-primary" href={`/search?code=${encodeURIComponent(panelPin.code)}`}>
                كل تاريخ الخط
              </Link>
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}
