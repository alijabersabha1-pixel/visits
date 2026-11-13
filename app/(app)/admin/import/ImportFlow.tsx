"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

type Field = string;
type Sheet = {
  name: string;
  role: "LOG" | "TARGETS" | "EXCLUDED" | "IGNORED";
  rows: number;
  headers: string[];
  columns: Record<Field, string>;
  extraColumns: string[];
};
type Preview = {
  month: string;
  summary: {
    newLines: number;
    changedLines: number;
    unchangedLines: number;
    missingFromFile: number;
    targets: number;
    excludedTargets: number;
    logRows: number;
    problems: number;
  };
  blocking: string[];
  sameFileImportedBefore: boolean;
  unknownLocalities: string[];
  sheets: Sheet[];
  fields: Record<Field, string>;
  columnMap: Record<Field, string>;
  problems: Array<{ sheet: string; row: number; reason: string }>;
  changed: Array<{ code: string; changes: Record<string, { from: unknown; to: unknown }> }>;
  newLines: Array<{ code: string; accountName: string | null; region: string | null }>;
};

const ROLE: Record<Sheet["role"], { text: string; tone: string }> = {
  LOG: { text: "سجل الإدارة", tone: "badge-blue" },
  TARGETS: { text: "زيارات الشهر", tone: "badge-green" },
  EXCLUDED: { text: "مستثناة", tone: "badge-warn" },
  IGNORED: { text: "بتنتجاهل", tone: "badge-gray" },
};

const FIELD_NAMES: Record<string, string> = {
  code: "Line Code",
  accountName: "الحساب",
  speed: "السرعة",
  locality: "المكان",
  region: "المنطقة",
  accountManager: "مدير الحساب",
  fixedIp: "Fixed IP",
  addrLocality: "Addr Locality",
  addrQuarter: "Addr Quarter",
  manual: "مضاف يدوياً",
};

function thisMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function show(v: unknown) {
  if (v === null || v === undefined || v === "") return "—";
  if (v === true) return "نعم";
  if (v === false) return "لا";
  return String(v);
}

async function send(url: string, file: File, month: string, columnMap?: Record<string, string>) {
  const fd = new FormData();
  fd.set("file", file);
  fd.set("month", month);
  if (columnMap) fd.set("columnMap", JSON.stringify(columnMap));
  try {
    const res = await fetch(url, { method: "POST", body: fd, credentials: "same-origin" });
    const data = await res.json().catch(() => ({}));
    return res.ok
      ? { ok: true as const, data }
      : { ok: false as const, error: (data as { error?: string }).error ?? "صار خطأ" };
  } catch {
    return { ok: false as const, error: "ما في اتصال بالسيرفر" };
  }
}

export function ImportFlow() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [month, setMonth] = useState(thisMonth);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [columnMap, setColumnMap] = useState<Record<string, string> | undefined>(undefined);
  const [busy, setBusy] = useState<null | "preview" | "save">(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  // الملف بينقرأ من الخانة وقت الضغط، مش من state، عشان اختيار الملف قبل ما تجهز الصفحة ما يضيع
  const pickedFile = () => fileRef.current?.files?.[0] ?? null;

  async function runPreview(map = columnMap) {
    const file = pickedFile();
    if (!file) return setError("اختار ملف الشهر");
    setBusy("preview");
    setError(null);
    setDone(null);
    const res = await send("/api/import/preview", file, month, map);
    setBusy(null);
    if (!res.ok) {
      setPreview(null);
      return setError(res.error);
    }
    setPreview(res.data as Preview);
  }

  async function save() {
    const file = pickedFile();
    if (!file || !preview) return;
    setBusy("save");
    setError(null);
    const res = await send("/api/import", file, month, columnMap);
    setBusy(null);
    if (!res.ok) return setError(res.error);
    const s = (res.data as { summary: Preview["summary"] }).summary;
    setDone(
      `انحفظ ملف شهر ${month}: ${s.newLines} خط جديد، ${s.changedLines} تغيّرت بياناته، ${s.targets} زيارة للشهر.`,
    );
    setPreview(null);
    setColumnMap(undefined);
    if (fileRef.current) fileRef.current.value = "";
    router.refresh();
  }

  function changeColumn(field: string, header: string) {
    const base = { ...(columnMap ?? preview?.columnMap ?? {}) };
    if (header) base[field] = header;
    else delete base[field];
    setColumnMap(base);
    void runPreview(base);
  }

  const allHeaders = preview
    ? [...new Set(preview.sheets.filter((s) => s.role !== "IGNORED" || s.headers.length).flatMap((s) => s.headers))]
    : [];
  const firstUsed = preview?.sheets.find((s) => s.role !== "IGNORED");
  const s = preview?.summary;

  return (
    <div className="grid" style={{ marginBottom: 16 }}>
      <div className="card card-pad">
        <div className="form-grid">
          <div className="field">
            <label htmlFor="month">الشهر</label>
            <input
              id="month"
              type="month"
              className="input"
              value={month}
              onChange={(e) => {
                setMonth(e.target.value);
                setPreview(null);
              }}
              required
            />
          </div>
          <div className="field">
            <label htmlFor="file">ملف الإكسل</label>
            <input
              id="file"
              ref={fileRef}
              type="file"
              className="input"
              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              onChange={() => {
                setPreview(null);
                setColumnMap(undefined);
              }}
            />
          </div>
          <div>
            <button className="btn btn-primary" disabled={busy !== null} onClick={() => runPreview()}>
              {busy === "preview" ? "عم نقرأ الملف…" : "معاينة"}
            </button>
          </div>
        </div>
        {error && (
          <div className="alert alert-error" role="alert" style={{ marginTop: 14 }}>
            {error}
          </div>
        )}
        {done && (
          <div className="alert alert-ok" role="status" style={{ marginTop: 14 }}>
            {done}
          </div>
        )}
      </div>

      {preview && s && (
        <>
          {preview.sameFileImportedBefore && (
            <div className="alert alert-warn" role="status">
              نفس هالملف انرفع قبل. الحفظ مرة تانية ما بيكرر شي، بس بيحدّث.
            </div>
          )}
          {preview.blocking.map((b) => (
            <div key={b} className="alert alert-error" role="alert">
              {b}
            </div>
          ))}

          <div className="grid grid-3">
            <Stat label="خطوط جديدة" value={s.newLines} />
            <Stat label="تغيّرت بياناتها" value={s.changedLines} sub={`${s.unchangedLines} ما تغيّرت`} />
            <Stat label="مش موجودة بهالملف" value={s.missingFromFile} sub="بتتعلّم وما بتنمسح" />
            <Stat
              label={`زيارات شهر ${preview.month}`}
              value={s.targets}
              sub={s.excludedTargets ? `منها ${s.excludedTargets} مستثناة` : undefined}
            />
            <Stat label="أسطر سجل الإدارة" value={s.logRows} sub="الإجراء النهائي لمدير المنطقة" />
            <Stat label="صفوف فيها مشكلة" value={s.problems} sub={s.problems ? "شوف تحت" : "ولا مشكلة"} />
          </div>

          <div className="card">
            <div className="card-head">
              <h2>الأوراق</h2>
            </div>
            <div className="table-wrap">
              <table className="table stack">
                <thead>
                  <tr>
                    <th>الورقة</th>
                    <th>شو هي</th>
                    <th>الصفوف</th>
                    <th>أعمدة إضافية بتنحفظ مع الخط</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.sheets.map((sh) => (
                    <tr key={sh.name}>
                      <td className="cell-main">
                        <b>{sh.name}</b>
                      </td>
                      <td data-label="شو هي">
                        <span className={`badge ${ROLE[sh.role].tone}`}>{ROLE[sh.role].text}</span>
                      </td>
                      <td data-label="الصفوف">{sh.rows}</td>
                      <td data-label="أعمدة إضافية" className="small muted">
                        {sh.extraColumns.join(" · ") || "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <details className="card" open={preview.blocking.length > 0}>
            <summary className="card-head" style={{ cursor: "pointer" }}>
              <h2>خريطة الأعمدة</h2>
              <span className="muted small">بتنحفظ للشهر الجاي لما تغيّرها</span>
            </summary>
            <div className="card-pad form-grid">
              {Object.entries(preview.fields).map(([field, label]) => {
                const current = (columnMap ?? preview.columnMap)[field] ?? firstUsed?.columns[field] ?? "";
                return (
                  <div className="field" key={field}>
                    <label htmlFor={`col-${field}`}>{label}</label>
                    <select
                      id={`col-${field}`}
                      className="select"
                      value={current}
                      disabled={busy !== null}
                      onChange={(e) => changeColumn(field, e.target.value)}
                    >
                      <option value="">— تلقائي —</option>
                      {allHeaders.map((h) => (
                        <option key={h} value={h}>
                          {h}
                        </option>
                      ))}
                    </select>
                  </div>
                );
              })}
            </div>
          </details>

          {preview.unknownLocalities.length > 0 && (
            <div className="alert alert-warn" role="status">
              أماكن مش معروفة منطقتها: {preview.unknownLocalities.join("، ")}. الخطوط بتنحفظ عادي، بس بدون منطقة لحد ما
              تنضاف للقائمة.
            </div>
          )}

          {preview.problems.length > 0 && (
            <div className="card">
              <div className="card-head">
                <h2>صفوف فيها مشكلة ({s.problems})</h2>
                <span className="muted small">بتنتجاهل، والباقي بينحفظ</span>
              </div>
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>الورقة</th>
                      <th>الصف</th>
                      <th>السبب</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.problems.map((p) => (
                      <tr key={`${p.sheet}-${p.row}`}>
                        <td>{p.sheet}</td>
                        <td className="ltr">{p.row}</td>
                        <td>{p.reason}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {preview.changed.length > 0 && (
            <details className="card">
              <summary className="card-head" style={{ cursor: "pointer" }}>
                <h2>الخطوط اللي تغيّرت بياناتها ({s.changedLines})</h2>
              </summary>
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Line Code</th>
                      <th>التغيير</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.changed.map((c) => (
                      <tr key={c.code}>
                        <td className="ltr">
                          <b>{c.code}</b>
                        </td>
                        <td className="small">
                          {Object.entries(c.changes).map(([f, v]) => (
                            <div key={f}>
                              <b>{FIELD_NAMES[f] ?? f}: </b>
                              <span className="diff-old">{show(v.from)}</span> ←{" "}
                              <span className="diff-new">{show(v.to)}</span>
                            </div>
                          ))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          )}

          <div className="card card-pad actions" style={{ justifyContent: "space-between" }}>
            <span className="muted">لما تحفظ، كل شي فوق بيتطبق متل ما هو بالضبط.</span>
            <button className="btn btn-green" disabled={busy !== null || preview.blocking.length > 0} onClick={save}>
              {busy === "save" ? (
                "عم نحفظ…"
              ) : (
                <>
                  حفظ ملف شهر <bdi dir="ltr">{preview.month}</bdi>
                </>
              )}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function Stat({ label, value, sub }: { label: React.ReactNode; value: number; sub?: string }) {
  return (
    <div className="card stat">
      <div className="label">{label}</div>
      <div className="value">{value}</div>
      {sub && <div className="sub">{sub}</div>}
    </div>
  );
}
