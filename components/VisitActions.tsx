"use client";

/** أزرار صغيرة على الزيارة: تعديل الحالة، حذف واسترجاع، تأجيل، قرار طلب التعديل */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { patchJson, postJson, sendJson } from "./fetcher";

type Option = { id: string; label: string };
const REVISIT = ["إعادة زيارة", "زيارة غير ناجحة"];

function useAction() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function run(p: Promise<{ ok: boolean; error?: string }>, after?: () => void) {
    setBusy(true);
    setError(null);
    const res = await p;
    setBusy(false);
    if (!res.ok) return setError(res.error ?? "صار خطأ");
    after?.();
    router.refresh();
  }
  return { error, busy, run, router };
}

export function StatusEditor({
  visitId,
  current,
  recommendations,
  actions,
}: {
  visitId: string;
  current: { recommendationId: string | null; actionId: string | null; revisitDue: string };
  recommendations: (Option & { active: boolean })[];
  actions: (Option & { active: boolean })[];
}) {
  const { error, busy, run } = useAction();
  const [rec, setRec] = useState(current.recommendationId ?? "");
  const [act, setAct] = useState(current.actionId ?? "");
  const [due, setDue] = useState(current.revisitDue);
  const [saved, setSaved] = useState(false);
  // القيم الموقوفة بتظهر بس إذا هي القيمة الحالية
  const recOpts = recommendations.filter((r) => r.active || r.id === current.recommendationId);
  const actOpts = actions.filter((r) => r.active || r.id === current.actionId);
  const recLabel = recOpts.find((r) => r.id === rec)?.label ?? "";
  const dirty =
    rec !== (current.recommendationId ?? "") || act !== (current.actionId ?? "") || due !== current.revisitDue;

  return (
    <form
      className="grid"
      onSubmit={(e) => {
        e.preventDefault();
        setSaved(false);
        const status: Record<string, unknown> = {};
        if (rec !== (current.recommendationId ?? "")) status.recommendationId = rec;
        if (act !== (current.actionId ?? "")) status.actionId = act || null;
        if (due !== current.revisitDue) status.revisitDue = due || null;
        void run(patchJson(`/api/visits/${visitId}`, { status }), () => setSaved(true));
      }}
    >
      {error && (
        <div className="alert alert-error" role="alert">
          {error}
        </div>
      )}
      {saved && !dirty && (
        <div className="alert alert-ok" role="status">
          انحفظت الحالة
        </div>
      )}
      <div className="form-grid">
        <div className="field">
          <label htmlFor="st-rec">التوصية</label>
          <select id="st-rec" className="select" value={rec} onChange={(e) => setRec(e.target.value)}>
            {!current.recommendationId && <option value="">—</option>}
            {recOpts.map((r) => (
              <option key={r.id} value={r.id}>
                {r.label}
                {r.active ? "" : " (قديمة)"}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="st-act">الإجراء المطبق</label>
          <select id="st-act" className="select" value={act} onChange={(e) => setAct(e.target.value)}>
            <option value="">—</option>
            {actOpts.map((r) => (
              <option key={r.id} value={r.id}>
                {r.label}
                {r.active ? "" : " (قديمة)"}
              </option>
            ))}
          </select>
        </div>
        {(REVISIT.includes(recLabel) || current.revisitDue) && (
          <div className="field">
            <label htmlFor="st-due">موعد إعادة الزيارة</label>
            <input id="st-due" type="date" className="input" value={due} onChange={(e) => setDue(e.target.value)} />
          </div>
        )}
      </div>
      <div>
        <button className="btn btn-primary" type="submit" disabled={busy || !dirty}>
          {busy ? "لحظة…" : "حفظ الحالة"}
        </button>
      </div>
    </form>
  );
}

export function DeleteVisitButton({ visitId, number }: { visitId: string; number: number }) {
  const { error, busy, run, router } = useAction();
  return (
    <>
      <button
        className="btn btn-danger btn-sm"
        disabled={busy}
        onClick={() => {
          if (!window.confirm(`حذف الزيارة رقم ${number}؟ بتنتقل لسلة المحذوفات وبترجع منها.`)) return;
          void run(sendJson("DELETE", `/api/visits/${visitId}`), () => router.push("/visits?deleted=1"));
        }}
      >
        حذف
      </button>
      {error && <span className="small warn-text">{error}</span>}
    </>
  );
}

export function RestoreVisitButton({ visitId }: { visitId: string }) {
  const { error, busy, run } = useAction();
  return (
    <>
      <button
        className="btn btn-ghost btn-sm"
        disabled={busy}
        onClick={() => run(postJson(`/api/visits/${visitId}/restore`))}
      >
        استرجاع
      </button>
      {error && <span className="small warn-text">{error}</span>}
    </>
  );
}

export function PostponeButton({ visitId }: { visitId: string }) {
  const { error, busy, run } = useAction();
  const [open, setOpen] = useState(false);
  if (!open) {
    return (
      <button className="btn btn-ghost btn-sm" onClick={() => setOpen(true)}>
        تأجيل
      </button>
    );
  }
  return (
    <form
      className="actions"
      onSubmit={(e) => {
        e.preventDefault();
        const reason = String(new FormData(e.currentTarget).get("reason") ?? "");
        void run(postJson(`/api/visits/${visitId}/postpone`, { reason }), () => setOpen(false));
      }}
    >
      <label className="sr-only" htmlFor={`pp-${visitId}`}>
        سبب التأجيل
      </label>
      <input
        id={`pp-${visitId}`}
        name="reason"
        className="input"
        style={{ minHeight: 32, width: 180 }}
        placeholder="السبب"
        required
        autoFocus
      />
      <button className="btn btn-primary btn-sm" type="submit" disabled={busy}>
        تأجيل
      </button>
      <button className="btn btn-ghost btn-sm" type="button" onClick={() => setOpen(false)}>
        إلغاء
      </button>
      {error && <span className="small warn-text">{error}</span>}
    </form>
  );
}

export function DecideButtons({ requestId }: { requestId: string }) {
  const { error, busy, run } = useAction();
  return (
    <span className="actions">
      <button
        className="btn btn-green btn-sm"
        disabled={busy}
        onClick={() => run(postJson(`/api/edit-requests/${requestId}`, { approve: true }))}
      >
        موافقة
      </button>
      <button
        className="btn btn-danger btn-sm"
        disabled={busy}
        onClick={() => run(postJson(`/api/edit-requests/${requestId}`, { approve: false }))}
      >
        رفض
      </button>
      {error && <span className="small warn-text">{error}</span>}
    </span>
  );
}
