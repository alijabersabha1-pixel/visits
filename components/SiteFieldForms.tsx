"use client";

/** إضافة حالة VPN أو بطاقة من الموقع (نفس المنطق تبع الجوال، بدون طابور) */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { postJson } from "./fetcher";

export function VpnSiteForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  if (!open)
    return (
      <div className="actions" style={{ marginBottom: 16 }}>
        <button className="btn btn-primary" onClick={() => setOpen(true)}>
          إضافة حالة VPN
        </button>
        {msg && <span className={msg.ok ? "small" : "small warn-text"}>{msg.text}</span>}
      </div>
    );
  return (
    <form
      className="card card-pad grid"
      style={{ marginBottom: 16 }}
      onSubmit={async (e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        const r = await postJson<{ previous: number }>("/api/vpn", {
          networkName: f.get("networkName"),
          ip: f.get("ip"),
          placeText: f.get("placeText"),
          suspects: f.get("suspects"),
          notes: f.get("notes"),
        });
        if (!r.ok) return setMsg({ ok: false, text: r.error });
        setOpen(false);
        setMsg({
          ok: true,
          text: r.data.previous ? `انحفظت. في ${r.data.previous} حالة سابقة بنفس الـ IP أو الاسم.` : "انحفظت.",
        });
        router.refresh();
      }}
    >
      {msg && !msg.ok && (
        <div className="alert alert-error" role="alert">
          {msg.text}
        </div>
      )}
      <div className="form-grid">
        <div className="field">
          <label htmlFor="vs-name">اسم الشبكة</label>
          <input id="vs-name" name="networkName" className="input" required />
        </div>
        <div className="field">
          <label htmlFor="vs-ip">الـ IP</label>
          <input id="vs-ip" name="ip" className="input ltr" required />
        </div>
        <div className="field">
          <label htmlFor="vs-place">وصف المكان</label>
          <input id="vs-place" name="placeText" className="input" />
        </div>
        <div className="field">
          <label htmlFor="vs-sus">الحسابات المشتبه فيها</label>
          <input id="vs-sus" name="suspects" className="input" />
        </div>
        <div className="field">
          <label htmlFor="vs-notes">ملاحظات</label>
          <input id="vs-notes" name="notes" className="input" />
        </div>
      </div>
      <div className="actions">
        <button className="btn btn-primary">حفظ</button>
        <button type="button" className="btn btn-ghost" onClick={() => setOpen(false)}>
          إلغاء
        </button>
      </div>
    </form>
  );
}

export function CardSiteForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!open)
    return (
      <button className="btn btn-primary" onClick={() => setOpen(true)} style={{ marginBottom: 16 }}>
        إضافة شراء بطاقة
      </button>
    );
  return (
    <form
      className="card card-pad grid"
      style={{ marginBottom: 16 }}
      onSubmit={async (e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        const r = await postJson("/api/cards", {
          name: f.get("name"),
          ip: f.get("ip"),
          price: f.get("price"),
          linkKind: "EXTERNAL",
        });
        if (!r.ok) return setError(r.error);
        setOpen(false);
        router.refresh();
      }}
    >
      {error && (
        <div className="alert alert-error" role="alert">
          {error}
        </div>
      )}
      <div className="form-grid">
        <div className="field">
          <label htmlFor="cs-name">اسم البطاقة أو الشبكة</label>
          <input id="cs-name" name="name" className="input" required />
        </div>
        <div className="field">
          <label htmlFor="cs-price">السعر (₪)</label>
          <input id="cs-price" name="price" className="input ltr" inputMode="decimal" required />
        </div>
        <div className="field">
          <label htmlFor="cs-ip">الـ IP (اختياري)</label>
          <input id="cs-ip" name="ip" className="input ltr" />
        </div>
      </div>
      <p className="small muted" style={{ margin: 0 }}>
        من الموقع بتنسجل كـ «فحص خارجي». للربط بزيارة أو حالة VPN استعمل تطبيق الميدان.
      </p>
      <div className="actions">
        <button className="btn btn-primary">حفظ</button>
        <button type="button" className="btn btn-ghost" onClick={() => setOpen(false)}>
          إلغاء
        </button>
      </div>
    </form>
  );
}
