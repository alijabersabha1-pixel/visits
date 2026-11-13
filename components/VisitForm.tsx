"use client";

/**
 * نموذج الزيارة: «جديدة»، أو «تعديل تقريري»، أو «طلب تعديل» على تقرير سفير تاني (مع سبب).
 * الحالة (التوصية والإجراء) بالزيارة الجديدة بس؛ بعدها بتتعدّل من StatusEditor.
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { patchJson, postJson } from "./fetcher";

type Option = { id: string; label: string; color?: string | null };
type Person = { id: string; displayName: string };

export interface ReportValues {
  visitedOn: string;
  lineCode: string;
  specialCase: boolean;
  accountName: string;
  place: string;
  companionIds: string[];
  tests: string;
  result: string;
}

const REVISIT = ["إعادة زيارة", "زيارة غير ناجحة"];

export function VisitForm({
  mode,
  visitId,
  initial,
  today,
  recommendations = [],
  actions = [],
  ambassadors,
  meId,
  revisitOfId,
}: {
  mode: "create" | "edit" | "request";
  visitId?: string;
  initial: ReportValues;
  today: string;
  recommendations?: Option[];
  actions?: Option[];
  ambassadors: Person[];
  meId: string;
  revisitOfId?: string;
}) {
  const router = useRouter();
  const [v, setV] = useState(initial);
  const [rec, setRec] = useState("");
  const [lookup, setLookup] = useState<{ text: string; tone: "ok" | "warn" } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof ReportValues>(k: K, val: ReportValues[K]) => setV((p) => ({ ...p, [k]: val }));
  const recLabel = recommendations.find((r) => r.id === rec)?.label ?? "";

  async function checkCode() {
    if (!v.lineCode.trim() || v.specialCase) return setLookup(null);
    try {
      const res = await fetch(`/api/lines/lookup?code=${encodeURIComponent(v.lineCode)}`);
      const d = await res.json();
      if (!d.valid) return setLookup({ text: "الكود مش صالح", tone: "warn" });
      if (!d.line)
        return setLookup({ text: "الخط مش موجود بملف المشتركين. بتقدر تحفظ عادي واكتب اسم الحساب.", tone: "warn" });
      if (!v.accountName && d.line.accountName) set("accountName", d.line.accountName);
      setLookup({
        text: `${d.line.accountName ?? ""}${d.line.region ? ` · ${d.line.region}` : ""}${d.openRevisit ? ` · بانتظار إعادة زيارة (#${d.openRevisit.number})` : ""}`,
        tone: "ok",
      });
    } catch {
      setLookup(null);
    }
  }

  /** بس الحقول اللي تغيّرت (للتعديل وطلب التعديل) */
  function changedFields() {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(v) as (keyof ReportValues)[]) {
      const a = v[k];
      const b = initial[k];
      if (JSON.stringify(a) !== JSON.stringify(b)) out[k] = typeof a === "string" ? a.trim() || null : a;
    }
    if ("visitedOn" in out && !out.visitedOn) delete out.visitedOn;
    return out;
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const f = new FormData(e.currentTarget);
    setBusy(true);
    let res;
    if (mode === "create") {
      res = await postJson<{ id: string; number: number; warning: string | null }>("/api/visits", {
        visitedOn: v.visitedOn,
        lineCode: v.specialCase ? null : v.lineCode,
        specialCase: v.specialCase,
        accountName: v.accountName || null,
        place: v.specialCase ? v.place || null : null,
        companionIds: v.companionIds,
        tests: v.tests || null,
        result: v.result || null,
        recommendationId: rec || undefined,
        actionId: f.get("actionId") || null,
        revisitDue: REVISIT.includes(recLabel) ? f.get("revisitDue") || null : null,
        revisitOfId: revisitOfId ?? null,
      });
      setBusy(false);
      if (!res.ok) return setError(res.error);
      // رمز ثابت بالرابط، مش نص: ما حدا بيقدر يبعت رابط فيه رسالة مزيفة
      const q = res.data.warning ? "?warning=unknown-line" : "?saved=1";
      router.push(`/visits/${res.data.id}${q}`);
      return;
    }
    const changes = changedFields();
    if (!Object.keys(changes).length) {
      setBusy(false);
      return setError("ما غيّرت شي");
    }
    res =
      mode === "edit"
        ? await patchJson(`/api/visits/${visitId}`, { report: changes })
        : await postJson(`/api/visits/${visitId}/edit-requests`, { changes, reason: f.get("reason") });
    setBusy(false);
    if (!res.ok) return setError(res.error);
    router.push(`/visits/${visitId}?${mode === "edit" ? "saved=1" : "requested=1"}`);
    router.refresh();
  }

  const others = ambassadors.filter((a) => a.id !== meId);

  return (
    <form onSubmit={onSubmit} className="grid" noValidate>
      {error && (
        <div className="alert alert-error" role="alert">
          {error}
        </div>
      )}
      <div className="card card-pad grid">
        <h2>الخط</h2>
        <label className="check">
          <input type="checkbox" checked={v.specialCase} onChange={(e) => set("specialCase", e.target.checked)} />
          حالة خاصة (بدون Line Code)
        </label>
        <div className="form-grid">
          {!v.specialCase && (
            <div className="field">
              <label htmlFor="lineCode">Line Code</label>
              <input
                id="lineCode"
                className="input"
                dir="ltr"
                value={v.lineCode}
                onChange={(e) => set("lineCode", e.target.value)}
                onBlur={checkCode}
                placeholder="G-7872-002"
                autoComplete="off"
                autoCapitalize="characters"
                required
              />
              {lookup && <span className={`hint ${lookup.tone === "warn" ? "warn-text" : ""}`}>{lookup.text}</span>}
            </div>
          )}
          <div className="field">
            <label htmlFor="accountName">{v.specialCase ? "الاسم" : "اسم الحساب"}</label>
            <input
              id="accountName"
              className="input"
              value={v.accountName}
              onChange={(e) => set("accountName", e.target.value)}
            />
            {!v.specialCase && <span className="hint">بينعبّى لحاله من ملف المشتركين</span>}
          </div>
          {v.specialCase && (
            <div className="field">
              <label htmlFor="place">المكان</label>
              <input id="place" className="input" value={v.place} onChange={(e) => set("place", e.target.value)} />
            </div>
          )}
          <div className="field">
            <label htmlFor="visitedOn">تاريخ الزيارة</label>
            <input
              id="visitedOn"
              type="date"
              className="input"
              max={today}
              value={v.visitedOn}
              onChange={(e) => set("visitedOn", e.target.value)}
              required
            />
          </div>
        </div>
        {others.length > 0 && (
          <fieldset className="field" style={{ border: 0, padding: 0, margin: 0 }}>
            <legend className="small" style={{ fontWeight: 600, marginBottom: 6 }}>
              المرافقين (اختياري)
            </legend>
            <div className="actions">
              {others.map((a) => (
                <label key={a.id} className="check chip">
                  <input
                    type="checkbox"
                    checked={v.companionIds.includes(a.id)}
                    onChange={(e) =>
                      set(
                        "companionIds",
                        e.target.checked ? [...v.companionIds, a.id] : v.companionIds.filter((x) => x !== a.id),
                      )
                    }
                  />
                  {a.displayName}
                </label>
              ))}
            </div>
          </fieldset>
        )}
      </div>

      <div className="card card-pad grid">
        <h2>التقرير</h2>
        <div className="field">
          <label htmlFor="tests">الفحوصات اللي تمت</label>
          <textarea
            id="tests"
            className="input"
            rows={3}
            value={v.tests}
            onChange={(e) => set("tests", e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="result">نتيجة الفحوصات</label>
          <textarea
            id="result"
            className="input"
            rows={4}
            value={v.result}
            onChange={(e) => set("result", e.target.value)}
          />
        </div>
      </div>

      {mode === "create" && (
        <div className="card card-pad grid">
          <h2>الحالة</h2>
          <div className="form-grid">
            <div className="field">
              <label htmlFor="recommendationId">التوصية</label>
              <select
                id="recommendationId"
                className="select"
                value={rec}
                onChange={(e) => setRec(e.target.value)}
                required
              >
                <option value="">— اختار —</option>
                {recommendations.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="actionId">الإجراء المطبق (اختياري)</label>
              <select id="actionId" name="actionId" className="select" defaultValue="">
                <option value="">—</option>
                {actions.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.label}
                  </option>
                ))}
              </select>
            </div>
            {REVISIT.includes(recLabel) && (
              <div className="field">
                <label htmlFor="revisitDue">موعد مقترح لإعادة الزيارة (اختياري)</label>
                <input id="revisitDue" name="revisitDue" type="date" className="input" min={today} />
              </div>
            )}
          </div>
        </div>
      )}

      {mode === "request" && (
        <div className="card card-pad grid">
          <div className="alert alert-warn">
            هاد تقرير سفير تاني. التعديل بيوصله كطلب، وبيشوف القديم والجديد جنب بعض قبل ما يوافق.
          </div>
          <div className="field">
            <label htmlFor="reason">سبب التعديل</label>
            <input id="reason" name="reason" className="input" required minLength={2} />
          </div>
        </div>
      )}

      <div className="actions">
        <button className="btn btn-primary" type="submit" disabled={busy}>
          {busy ? "لحظة…" : mode === "create" ? "حفظ الزيارة" : mode === "edit" ? "حفظ التعديل" : "إرسال طلب التعديل"}
        </button>
        <button className="btn btn-ghost" type="button" onClick={() => router.back()}>
          إلغاء
        </button>
      </div>
    </form>
  );
}
