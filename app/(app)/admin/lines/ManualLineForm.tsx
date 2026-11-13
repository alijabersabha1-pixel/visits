"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { postJson } from "@/components/fetcher";

export function ManualLineForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formEl = e.currentTarget;
    const f = new FormData(formEl);
    setBusy(true);
    setError(null);
    const res = await postJson<{ line: { code: string } }>("/api/lines", {
      code: f.get("code"),
      accountName: f.get("accountName"),
      speed: f.get("speed"),
      locality: f.get("locality"),
      fixedIp: f.get("fixedIp"),
    });
    setBusy(false);
    if (!res.ok) return setError(res.error);
    formEl.reset();
    setOpen(false);
    setDone(`انضاف الخط ${res.data.line.code}`);
    router.refresh();
  }

  if (!open) {
    return (
      <div style={{ marginBottom: 16 }}>
        {done && (
          <div className="alert alert-ok" role="status" style={{ marginBottom: 10 }}>
            {done}
          </div>
        )}
        <button
          className="btn btn-primary"
          onClick={() => {
            setDone(null);
            setOpen(true);
          }}
        >
          إضافة خط طارئ
        </button>
      </div>
    );
  }

  return (
    <div className="card card-pad" style={{ marginBottom: 16 }}>
      <form onSubmit={onSubmit} className="grid">
        <h2>إضافة خط طارئ</h2>
        <p className="muted small" style={{ margin: 0 }}>
          للخط اللي وصلك بإيميل قبل ملف الشهر الجاي. بينعلّم «مضاف يدوياً»، ولما يوصل بالملف بتتحدّث بياناته.
        </p>
        {error && (
          <div className="alert alert-error" role="alert">
            {error}
          </div>
        )}
        <div className="form-grid">
          <div className="field">
            <label htmlFor="code">Line Code</label>
            <input id="code" name="code" className="input" dir="ltr" required autoFocus placeholder="G-7872-002" />
          </div>
          <div className="field">
            <label htmlFor="accountName">اسم الحساب</label>
            <input id="accountName" name="accountName" className="input" required />
          </div>
          <div className="field">
            <label htmlFor="locality">المكان (Locality)</label>
            <input id="locality" name="locality" className="input" placeholder="خانيونس" />
          </div>
          <div className="field">
            <label htmlFor="speed">السرعة</label>
            <input id="speed" name="speed" className="input" dir="ltr" placeholder="Filine 200 Mbps" />
          </div>
          <div className="field">
            <label htmlFor="fixedIp">Fixed IP</label>
            <input id="fixedIp" name="fixedIp" className="input" dir="ltr" />
          </div>
        </div>
        <div className="actions">
          <button className="btn btn-primary" type="submit" disabled={busy}>
            {busy ? "لحظة…" : "إضافة"}
          </button>
          <button className="btn btn-ghost" type="button" onClick={() => setOpen(false)}>
            إلغاء
          </button>
        </div>
      </form>
    </div>
  );
}
