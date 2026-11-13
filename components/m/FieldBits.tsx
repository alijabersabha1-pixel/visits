"use client";

import { useEffect, useState } from "react";
import { compressImage, readGps, type Gps } from "@/lib/offline/device";

/** الموقع بيتحدد لحاله أول ما يفتح النموذج، وبيشتغل بدون نت */
export function GpsBox({
  value,
  onChange,
  autoStart = true,
}: {
  value: Gps | null;
  onChange: (g: Gps | null) => void;
  autoStart?: boolean;
}) {
  const [state, setState] = useState<"idle" | "busy" | "error">(autoStart && !value ? "busy" : "idle");
  const [error, setError] = useState("");
  const locate = () =>
    readGps()
      .then((g) => {
        onChange(g);
        setState("idle");
      })
      .catch((e: Error) => {
        setError(e.message);
        setState("error");
      });
  const read = () => {
    setState("busy");
    void locate();
  };
  useEffect(() => {
    if (autoStart && !value) void locate();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- مرة وحدة عند الفتح
  }, []);
  return (
    <div className="field">
      <span style={{ fontWeight: 600, fontSize: 14 }}>الموقع (GPS)</span>
      <div className="actions" style={{ alignItems: "center" }}>
        {value ? (
          <span className="small" data-testid="gps">
            <span className="ltr">
              {value.lat.toFixed(5)}, {value.lng.toFixed(5)}
            </span>{" "}
            <span className={`badge ${value.accuracy <= 30 ? "badge-green" : "badge-warn"}`}>
              دقة ±{Math.round(value.accuracy)} متر
            </span>
          </span>
        ) : state === "busy" ? (
          <span className="small muted">عم نحدد الموقع…</span>
        ) : (
          <span className="small warn-text">{state === "error" ? error : "ما انحدد"}</span>
        )}
        <button type="button" className="btn btn-ghost btn-sm" onClick={read} disabled={state === "busy"}>
          {value ? "تحديث" : "حدد الموقع"}
        </button>
      </div>
    </div>
  );
}

export function PhotoPicker({
  value,
  onChange,
  max,
}: {
  value: string[];
  onChange: (v: string[]) => void;
  max: number;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <div className="field">
      <label htmlFor="photos" style={{ fontWeight: 600, fontSize: 14 }}>
        {max > 1 ? `صور (اختياري، لغاية ${max})` : "صورة (اختياري)"}
      </label>
      <div className="photos">
        {value.map((src, i) => (
          <button
            key={i}
            type="button"
            style={{ padding: 0, border: 0, background: "none" }}
            onClick={() => onChange(value.filter((_, j) => j !== i))}
            aria-label={`شيل الصورة ${i + 1}`}
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- صورة محلية من الجوال */}
            <img src={src} alt="" />
          </button>
        ))}
      </div>
      {value.length < max && (
        <input
          id="photos"
          type="file"
          accept="image/*"
          capture="environment"
          className="input"
          multiple={max > 1}
          disabled={busy}
          onChange={async (e) => {
            const files = Array.from(e.target.files ?? []).slice(0, max - value.length);
            e.target.value = "";
            setBusy(true);
            setError("");
            try {
              const out = [];
              for (const f of files) out.push(await compressImage(f));
              onChange([...value, ...out]);
            } catch {
              setError("ما قدرنا نقرأ الصورة");
            }
            setBusy(false);
          }}
        />
      )}
      {busy && <span className="hint">عم نصغّر الصورة…</span>}
      {error && <span className="hint warn-text">{error}</span>}
    </div>
  );
}

export function Seg({
  options,
  value,
  onChange,
  name,
}: {
  options: { value: string; label: string }[];
  value: string;
  onChange: (v: string) => void;
  name: string;
}) {
  return (
    <div className="seg" role="group" aria-label={name}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={value === o.value}
          onClick={() => onChange(value === o.value ? "" : o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function SavedNotice({ text, onAgain }: { text: string; onAgain: () => void }) {
  return (
    <div className="grid">
      <div className="alert alert-ok" role="status">
        {text}
      </div>
      <div className="actions">
        <button className="btn btn-primary" onClick={onAgain}>
          وحدة كمان
        </button>
        <a className="btn btn-ghost" href="/m">
          للرئيسية
        </a>
      </div>
    </div>
  );
}
