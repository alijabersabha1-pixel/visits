"use client";

import { useState } from "react";
import { rememberRecent, useMobile } from "@/components/m/MobileShell";
import { GpsBox, PhotoPicker, SavedNotice, Seg } from "@/components/m/FieldBits";
import { enqueue } from "@/lib/offline/queue";
import { flushQueue } from "@/lib/offline/sync";
import { isValidLineCode } from "@/lib/line-code";
import type { Gps } from "@/lib/offline/device";

const REVISIT = ["إعادة زيارة", "زيارة غير ناجحة"];

export default function MobileVisit() {
  const { boot, online } = useMobile();
  const [form, setForm] = useState(0); // لإعادة تصفير النموذج
  const [saved, setSaved] = useState<string | null>(null);
  if (saved)
    return (
      <SavedNotice
        text={saved}
        onAgain={() => {
          setSaved(null);
          setForm((n) => n + 1);
        }}
      />
    );
  if (!boot) return <p className="muted">عم نحمّل القوائم…</p>;
  return <VisitFields key={form} onSaved={setSaved} online={online} />;
}

function VisitFields({ onSaved, online }: { onSaved: (t: string) => void; online: boolean }) {
  const { boot } = useMobile();
  const [special, setSpecial] = useState(false);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [place, setPlace] = useState("");
  const [hint, setHint] = useState("");
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [tests, setTests] = useState("");
  const [result, setResult] = useState("");
  const [rec, setRec] = useState("");
  const [action, setAction] = useState("");
  const [due, setDue] = useState("");
  const [companions, setCompanions] = useState<string[]>([]);
  const [gps, setGps] = useState<Gps | null>(null);
  const [photos, setPhotos] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  if (!boot) return null;
  const recLabel = boot.recommendations.find((r) => r.id === rec)?.label ?? "";

  async function lookup() {
    if (!online || !isValidLineCode(code)) return setHint("");
    try {
      const d = await (await fetch(`/api/lines/lookup?code=${encodeURIComponent(code)}`)).json();
      if (d.line) {
        if (!name) setName(d.line.accountName ?? "");
        setHint(`${d.line.accountName ?? ""}${d.openRevisit ? " · بانتظار إعادة زيارة" : ""}`);
      } else setHint("مش بملف المشتركين، اكتب اسم الحساب");
    } catch {
      setHint("");
    }
  }

  async function save() {
    setError("");
    if (!special && !isValidLineCode(code)) return setError("اكتب Line Code صالح، أو اختار «حالة خاصة»");
    if (special && !name.trim()) return setError("اكتب الاسم للحالة الخاصة");
    if (!rec) return setError("اختار التوصية");
    setBusy(true);
    const payload = {
      lineCode: special ? null : code.trim(),
      specialCase: special,
      accountName: name.trim() || null,
      place: special ? place.trim() || null : null,
      companionIds: companions,
      tests: tests.trim() || null,
      result: result.trim() || null,
      recommendationId: rec,
      actionId: action || null,
      revisitDue: REVISIT.includes(recLabel) && due ? due : null,
      gps,
      photos,
      mikrotik: Object.entries(answers)
        .filter(([, a]) => a)
        .map(([questionId, answer]) => ({ questionId, answer })),
    };
    const label = special ? `زيارة: ${name.trim()}` : `زيارة ${code.trim().toUpperCase()}`;
    const item = await enqueue("VISIT", payload, label);
    rememberRecent({ uuid: item.uuid, kind: "VISIT", label, at: item.filledAt });
    const r = navigator.onLine ? await flushQueue().catch(() => null) : null;
    setBusy(false);
    onSaved(r && r.sent > 0 ? "انبعتت الزيارة." : "انحفظت الزيارة بالجوال، وبتنبعت لحالها لما يرجع النت.");
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
      <h1 style={{ fontSize: 20 }}>زيارة جديدة</h1>
      {error && (
        <div className="alert alert-error" role="alert">
          {error}
        </div>
      )}

      <div className="card card-pad grid">
        <label className="check">
          <input type="checkbox" checked={special} onChange={(e) => setSpecial(e.target.checked)} />
          حالة خاصة (بدون Line Code)
        </label>
        {!special && (
          <div className="field">
            <label htmlFor="m-code">Line Code</label>
            <input
              id="m-code"
              className="input ltr"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              onBlur={lookup}
              autoCapitalize="characters"
              autoComplete="off"
              placeholder="G-7872-002"
            />
            {hint && <span className="hint">{hint}</span>}
          </div>
        )}
        <div className="field">
          <label htmlFor="m-name">{special ? "الاسم" : "اسم الحساب (اختياري)"}</label>
          <input id="m-name" className="input" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        {special && (
          <div className="field">
            <label htmlFor="m-place">المكان</label>
            <input id="m-place" className="input" value={place} onChange={(e) => setPlace(e.target.value)} />
          </div>
        )}
        <GpsBox value={gps} onChange={setGps} />
      </div>

      {boot.mikrotikQuestions.length > 0 && (
        <div className="card card-pad grid">
          <h2>المايكروتيك</h2>
          {boot.mikrotikQuestions.map((q) => (
            <div key={q.id} className="field">
              <span className="small" style={{ fontWeight: 600 }}>
                {q.text}
              </span>
              <Seg
                name={q.text}
                options={q.options.map((o) => ({ value: o, label: o }))}
                value={answers[q.id] ?? ""}
                onChange={(v) => setAnswers((a) => ({ ...a, [q.id]: v }))}
              />
            </div>
          ))}
        </div>
      )}

      <div className="card card-pad grid">
        <h2>التقرير</h2>
        <div className="field">
          <label htmlFor="m-tests">الفحوصات اللي تمت</label>
          <textarea id="m-tests" className="input" rows={3} value={tests} onChange={(e) => setTests(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="m-result">نتيجة الفحوصات</label>
          <textarea
            id="m-result"
            className="input"
            rows={3}
            value={result}
            onChange={(e) => setResult(e.target.value)}
          />
        </div>
        <div className="field">
          <span className="small" style={{ fontWeight: 600 }}>
            التوصية
          </span>
          <Seg
            name="التوصية"
            options={boot.recommendations.map((r) => ({ value: r.id, label: r.label }))}
            value={rec}
            onChange={setRec}
          />
        </div>
        {REVISIT.includes(recLabel) && (
          <div className="field">
            <label htmlFor="m-due">موعد مقترح لإعادة الزيارة (اختياري)</label>
            <input id="m-due" type="date" className="input" value={due} onChange={(e) => setDue(e.target.value)} />
          </div>
        )}
        <div className="field">
          <label htmlFor="m-action">الإجراء المطبق (اختياري)</label>
          <select id="m-action" className="select" value={action} onChange={(e) => setAction(e.target.value)}>
            <option value="">—</option>
            {boot.actions.map((a) => (
              <option key={a.id} value={a.id}>
                {a.label}
              </option>
            ))}
          </select>
        </div>
        {boot.ambassadors.filter((a) => a.id !== boot.me.id).length > 0 && (
          <div className="field">
            <span className="small" style={{ fontWeight: 600 }}>
              المرافقين
            </span>
            <div className="actions">
              {boot.ambassadors
                .filter((a) => a.id !== boot.me.id)
                .map((a) => (
                  <label key={a.id} className="check chip">
                    <input
                      type="checkbox"
                      checked={companions.includes(a.id)}
                      onChange={(e) =>
                        setCompanions((c) => (e.target.checked ? [...c, a.id] : c.filter((x) => x !== a.id)))
                      }
                    />
                    {a.displayName}
                  </label>
                ))}
            </div>
          </div>
        )}
        <PhotoPicker value={photos} onChange={setPhotos} max={5} />
      </div>

      <div className="m-sticky-save">
        <button className="btn btn-green btn-block" type="submit" disabled={busy}>
          {busy ? "عم نحفظ…" : "حفظ الزيارة"}
        </button>
      </div>
    </form>
  );
}
