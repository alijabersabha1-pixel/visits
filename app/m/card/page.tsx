"use client";

import { useState } from "react";
import { recentItems } from "@/components/m/MobileShell";
import { GpsBox, PhotoPicker, SavedNotice, Seg } from "@/components/m/FieldBits";
import { enqueue } from "@/lib/offline/queue";
import { flushQueue } from "@/lib/offline/sync";
import type { Gps } from "@/lib/offline/device";

const LINKS = [
  { value: "VISIT", label: "زيارة" },
  { value: "EXTERNAL", label: "فحص خارجي" },
  { value: "VPN", label: "حالة VPN" },
  { value: "NONE", label: "لا شيء" },
];

export default function MobileCard() {
  const [n, setN] = useState(0);
  const [saved, setSaved] = useState<string | null>(null);
  if (saved)
    return (
      <SavedNotice
        text={saved}
        onAgain={() => {
          setSaved(null);
          setN((x) => x + 1);
        }}
      />
    );
  return <CardFields key={n} onSaved={setSaved} />;
}

function CardFields({ onSaved }: { onSaved: (t: string) => void }) {
  const [name, setName] = useState("");
  const [ip, setIp] = useState("");
  const [price, setPrice] = useState("");
  const [link, setLink] = useState("NONE");
  const [ref, setRef] = useState("");
  const [gps, setGps] = useState<Gps | null>(null);
  const [photo, setPhoto] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const recent = link === "VISIT" || link === "VPN" ? recentItems(link) : [];

  async function save() {
    setError("");
    const p = Number(price.replace(",", "."));
    if (!name.trim()) return setError("اكتب اسم البطاقة أو الشبكة");
    if (!(p > 0)) return setError("السعر لازم يكون أكبر من صفر");
    if ((link === "VISIT" || link === "VPN") && !ref) return setError("اختار الزيارة أو الحالة المرتبطة");
    setBusy(true);
    await enqueue(
      "CARD",
      {
        name: name.trim(),
        ip: ip.trim() || null,
        price: p,
        linkKind: link,
        linkRef: ref || null,
        gps,
        photo: photo[0] ?? null,
      },
      `بطاقة ${name.trim()} (${p} ₪)`,
    );
    const r = navigator.onLine ? await flushQueue().catch(() => null) : null;
    setBusy(false);
    onSaved(r && r.sent > 0 ? "انبعتت البطاقة." : "انحفظت بالجوال، وبتنبعت لحالها لما يرجع النت.");
  }

  return (
    <form
      className="grid"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
      noValidate
    >
      <h1 style={{ fontSize: 20 }}>شراء بطاقة</h1>
      {error && (
        <div className="alert alert-error" role="alert">
          {error}
        </div>
      )}
      <div className="card card-pad grid">
        <div className="field">
          <label htmlFor="c-name">اسم البطاقة أو الشبكة</label>
          <input id="c-name" className="input" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="c-price">السعر (₪)</label>
          <input
            id="c-price"
            className="input ltr"
            inputMode="decimal"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="c-ip">الـ IP اللي انأخذ من الشبكة (اختياري)</label>
          <input id="c-ip" className="input ltr" value={ip} onChange={(e) => setIp(e.target.value)} />
        </div>
        <div className="field">
          <span className="small" style={{ fontWeight: 600 }}>
            مرتبطة بـ
          </span>
          <Seg
            name="مرتبطة بـ"
            options={LINKS}
            value={link}
            onChange={(v) => {
              setLink(v || "NONE");
              setRef("");
            }}
          />
        </div>
        {(link === "VISIT" || link === "VPN") && (
          <div className="field">
            <label htmlFor="c-ref">{link === "VISIT" ? "الزيارة" : "الحالة"} (من اللي سجلتها هالأيام)</label>
            <select id="c-ref" className="select" value={ref} onChange={(e) => setRef(e.target.value)}>
              <option value="">— اختار —</option>
              {recent.map((r) => (
                <option key={r.uuid} value={r.uuid}>
                  {r.label} ·{" "}
                  {new Date(r.at).toLocaleString("ar-PS-u-nu-latn", { dateStyle: "short", timeStyle: "short" })}
                </option>
              ))}
            </select>
            {recent.length === 0 && <span className="hint">ما في شي مسجل على هالجوال آخر 3 أيام.</span>}
          </div>
        )}
        <GpsBox value={gps} onChange={setGps} />
        <PhotoPicker value={photo} onChange={setPhoto} max={1} />
      </div>
      <div className="m-sticky-save">
        <button className="btn btn-green btn-block" type="submit" disabled={busy}>
          {busy ? "عم نحفظ…" : "حفظ البطاقة"}
        </button>
      </div>
    </form>
  );
}
