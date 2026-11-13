"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { patchJson, postJson } from "@/components/fetcher";
import { ROLE_HINT, ROLE_LABEL } from "@/lib/roles";

export interface UserRow {
  id: string;
  username: string;
  displayName: string;
  role: "MANAGER" | "AMBASSADOR";
  active: boolean;
  locked: boolean;
  lockedUntil: string | null;
  mustChangePassword: boolean;
  createdAt: string;
  sessionCount: number;
  lastSeenAt: string | null;
}

const dateFmt = new Intl.DateTimeFormat("ar-PS-u-nu-latn", { dateStyle: "medium", timeStyle: "short" });

type Dialog =
  | { kind: "add" }
  | { kind: "edit"; user: UserRow }
  | {
      kind: "confirm";
      title: string;
      body: string;
      action: () => Promise<string | null>;
      danger?: boolean;
      cta: string;
    }
  | { kind: "password"; user: Pick<UserRow, "displayName" | "username">; password: string; isNew: boolean };

export function UsersManager({
  initialUsers,
  meId,
  canManage,
}: {
  initialUsers: UserRow[];
  meId: string;
  canManage: boolean;
}) {
  const router = useRouter();
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const users = initialUsers;

  const close = () => setDialog(null);
  const done = (text: string) => {
    setNotice({ ok: true, text });
    router.refresh();
  };

  function confirmToggle(u: UserRow) {
    setDialog({
      kind: "confirm",
      title: u.active ? `إيقاف حساب ${u.displayName}؟` : `تفعيل حساب ${u.displayName}؟`,
      body: u.active
        ? "بيطلع فوراً من كل الأجهزة، وما بيقدر يدخل لحد ما ترجع تفعّله. زياراته وسجله بيضلوا زي ما هم."
        : "بيقدر يدخل من جديد بكلمة سره.",
      danger: u.active,
      cta: u.active ? "إيقاف" : "تفعيل",
      action: async () => {
        const res = await patchJson(`/api/users/${u.id}`, { active: !u.active });
        if (!res.ok) return res.error;
        done(u.active ? `انوقف حساب ${u.displayName}` : `تفعّل حساب ${u.displayName}`);
        return null;
      },
    });
  }

  function confirmRevoke(u: UserRow) {
    setDialog({
      kind: "confirm",
      title: `طرد ${u.displayName} من كل الأجهزة؟`,
      body: "للجوال الضايع: كل الجلسات بتنلغي فوراً، وبيقدر يدخل من جديد بكلمة سره. إذا خايف حدا بيعرف كلمة السر، استعمل «كلمة سر مؤقتة» بدالها.",
      danger: true,
      cta: "طرد من كل الأجهزة",
      action: async () => {
        const res = await postJson<{ revoked: number }>(`/api/users/${u.id}/revoke-sessions`);
        if (!res.ok) return res.error;
        done(`انلغت ${res.data.revoked} جلسة لـ ${u.displayName}`);
        return null;
      },
    });
  }

  function confirmReset(u: UserRow) {
    setDialog({
      kind: "confirm",
      title: `كلمة سر مؤقتة لـ ${u.displayName}؟`,
      body: "كلمة السر الحالية بتبطل تشتغل، وبيطلع من كل الأجهزة. أول ما يدخل بالمؤقتة لازم يختار كلمة سر جديدة.",
      cta: "أعطيه كلمة سر مؤقتة",
      action: async () => {
        const res = await postJson<{ tempPassword: string }>(`/api/users/${u.id}/reset-password`);
        if (!res.ok) return res.error;
        router.refresh();
        setDialog({ kind: "password", user: u, password: res.data.tempPassword, isNew: false });
        return "keep-open";
      },
    });
  }

  return (
    <>
      {notice && (
        <div className={`alert ${notice.ok ? "alert-ok" : "alert-error"}`} role="status" style={{ marginBottom: 16 }}>
          {notice.text}
        </div>
      )}

      <div className="card">
        <div className="card-head">
          <h2>
            الحسابات <span className="muted small">({users.length})</span>
          </h2>
          {canManage ? (
            <button className="btn btn-primary" onClick={() => setDialog({ kind: "add" })}>
              إضافة مستخدم
            </button>
          ) : (
            <span className="badge badge-gray">للاطلاع فقط</span>
          )}
        </div>
        <div className="table-wrap">
          <table className="table stack">
            <thead>
              <tr>
                <th>الاسم</th>
                <th>الدور</th>
                <th>الحالة</th>
                <th>آخر نشاط</th>
                {canManage && (
                  <th>
                    <span className="sr-only">إجراءات</span>
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {users.map((u) => {
                const isMe = u.id === meId;
                return (
                  <tr key={u.id} className={u.active ? undefined : "inactive"} data-username={u.username}>
                    <td className="cell-main">
                      <b>{u.displayName}</b>
                      {isMe && <span className="muted small"> (أنت)</span>}
                      <div className="muted small ltr" style={{ textAlign: "right" }}>
                        {u.username}
                      </div>
                    </td>
                    <td data-label="الدور">
                      <span
                        className={`badge ${u.role === "MANAGER" ? "badge-blue" : "badge-green"}`}
                        title={ROLE_HINT[u.role]}
                      >
                        {ROLE_LABEL[u.role]}
                      </span>
                    </td>
                    <td data-label="الحالة">
                      {!u.active ? (
                        <span className="badge badge-gray">موقوف</span>
                      ) : u.locked ? (
                        <span
                          className="badge badge-red"
                          title={u.lockedUntil ? dateFmt.format(new Date(u.lockedUntil)) : undefined}
                        >
                          مقفل مؤقتاً
                        </span>
                      ) : u.mustChangePassword ? (
                        <span className="badge badge-warn">بانتظار تغيير كلمة السر</span>
                      ) : (
                        <span className="badge badge-green">فعّال</span>
                      )}
                    </td>
                    <td data-label="آخر نشاط" className="small muted">
                      {u.lastSeenAt ? dateFmt.format(new Date(u.lastSeenAt)) : "—"}
                      {u.sessionCount > 1 && <div>{u.sessionCount} أجهزة</div>}
                    </td>
                    {canManage && (
                      <td className="cell-actions">
                        <div className="actions">
                          <button className="btn btn-ghost btn-sm" onClick={() => setDialog({ kind: "edit", user: u })}>
                            تعديل
                          </button>
                          {!isMe && (
                            <>
                              <button className="btn btn-ghost btn-sm" onClick={() => confirmReset(u)}>
                                كلمة سر مؤقتة
                              </button>
                              {u.sessionCount > 0 && (
                                <button className="btn btn-ghost btn-sm" onClick={() => confirmRevoke(u)}>
                                  طرد من كل الأجهزة
                                </button>
                              )}
                              <button
                                className={`btn btn-sm ${u.active ? "btn-danger" : "btn-ghost"}`}
                                onClick={() => confirmToggle(u)}
                              >
                                {u.active ? "إيقاف" : "تفعيل"}
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {dialog?.kind === "add" && (
        <UserFormDialog
          onClose={close}
          onSaved={(u, password) => {
            router.refresh();
            setNotice({ ok: true, text: `انضاف ${u.displayName}` });
            setDialog({ kind: "password", user: u, password, isNew: true });
          }}
        />
      )}
      {dialog?.kind === "edit" && (
        <UserFormDialog
          user={dialog.user}
          isMe={dialog.user.id === meId}
          onClose={close}
          onSaved={(u) => {
            close();
            done(`انحفظت بيانات ${u.displayName}`);
          }}
        />
      )}
      {dialog?.kind === "confirm" && <ConfirmDialog dialog={dialog} onClose={close} />}
      {dialog?.kind === "password" && <PasswordDialog dialog={dialog} onClose={close} />}
    </>
  );
}

function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  return (
    <dialog
      ref={(el) => {
        ref.current = el;
        if (el && !el.open) el.showModal();
      }}
      className="modal"
      aria-label={title}
      onClose={onClose}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      {children}
    </dialog>
  );
}

function UserFormDialog({
  user,
  isMe,
  onClose,
  onSaved,
}: {
  user?: UserRow;
  isMe?: boolean;
  onClose: () => void;
  onSaved: (u: Pick<UserRow, "displayName" | "username">, password: string) => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const editing = !!user;

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const f = new FormData(e.currentTarget);
    const displayName = String(f.get("displayName") ?? "");
    const role = String(f.get("role") ?? user?.role ?? "AMBASSADOR");
    if (editing) {
      const res = await patchJson<{ user: UserRow }>(`/api/users/${user.id}`, { displayName, role });
      setBusy(false);
      if (!res.ok) return setError(res.error);
      onSaved(res.data.user, "");
    } else {
      const res = await postJson<{ user: UserRow; tempPassword: string }>("/api/users", {
        username: f.get("username"),
        displayName,
        role,
      });
      setBusy(false);
      if (!res.ok) return setError(res.error);
      onSaved(res.data.user, res.data.tempPassword);
    }
  }

  return (
    <Modal title={editing ? "تعديل مستخدم" : "إضافة مستخدم"} onClose={onClose}>
      <form onSubmit={onSubmit}>
        <div className="modal-body">
          <h2>{editing ? `تعديل ${user.displayName}` : "إضافة مستخدم"}</h2>
          {error && (
            <div className="alert alert-error" role="alert">
              {error}
            </div>
          )}
          <div className="field">
            <label htmlFor="displayName">الاسم</label>
            <input
              id="displayName"
              name="displayName"
              className="input"
              defaultValue={user?.displayName}
              required
              autoFocus
            />
          </div>
          {!editing && (
            <div className="field">
              <label htmlFor="new-username">اسم الدخول</label>
              <input
                id="new-username"
                name="username"
                className="input"
                dir="ltr"
                autoCapitalize="none"
                spellCheck={false}
                required
              />
              <span className="hint">بالإنجليزي، متل ahmad.s — ما بيتغيّر بعدين</span>
            </div>
          )}
          <div className="field">
            <label htmlFor="role">الدور</label>
            <select id="role" name="role" className="select" defaultValue={user?.role ?? "AMBASSADOR"} disabled={isMe}>
              <option value="AMBASSADOR">سفير — بيعمل كل شي</option>
              <option value="MANAGER">مسؤول — للقراءة بس</option>
            </select>
            {isMe && <span className="hint">ما بتقدر تغيّر دورك أنت.</span>}
          </div>
          {!editing && (
            <p className="muted small" style={{ margin: 0 }}>
              النظام بيعطيه كلمة سر مؤقتة بتشوفها بعد الحفظ، وبيغيّرها أول ما يدخل.
            </p>
          )}
        </div>
        <div className="modal-foot">
          <button className="btn btn-primary" type="submit" disabled={busy}>
            {busy ? "لحظة…" : editing ? "حفظ" : "إضافة"}
          </button>
          <button className="btn btn-ghost" type="button" onClick={onClose}>
            إلغاء
          </button>
        </div>
      </form>
    </Modal>
  );
}

function ConfirmDialog({ dialog, onClose }: { dialog: Extract<Dialog, { kind: "confirm" }>; onClose: () => void }) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <Modal title={dialog.title} onClose={onClose}>
      <div className="modal-body">
        <h2>{dialog.title}</h2>
        <p className="muted" style={{ margin: 0 }}>
          {dialog.body}
        </p>
        {error && (
          <div className="alert alert-error" role="alert">
            {error}
          </div>
        )}
      </div>
      <div className="modal-foot">
        <button
          className={`btn ${dialog.danger ? "btn-danger" : "btn-primary"}`}
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            const err = await dialog.action();
            setBusy(false);
            if (err === "keep-open") return;
            if (err) return setError(err);
            onClose();
          }}
        >
          {busy ? "لحظة…" : dialog.cta}
        </button>
        <button className="btn btn-ghost" onClick={onClose}>
          إلغاء
        </button>
      </div>
    </Modal>
  );
}

function PasswordDialog({ dialog, onClose }: { dialog: Extract<Dialog, { kind: "password" }>; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  return (
    <Modal title="كلمة السر المؤقتة" onClose={onClose}>
      <div className="modal-body">
        <h2>كلمة السر المؤقتة لـ {dialog.user.displayName}</h2>
        <p className="muted" style={{ margin: 0 }}>
          ابعتله اسم الدخول وكلمة السر. بتنعرض هالمرة بس، وأول ما يدخل لازم يغيّرها.
        </p>
        <div className="small muted">
          اسم الدخول: <b className="ltr">{dialog.user.username}</b>
        </div>
        <div className="temp-pass ltr" data-testid="temp-password">
          {dialog.password}
        </div>
      </div>
      <div className="modal-foot">
        <button
          className="btn btn-primary"
          onClick={async () => {
            await navigator.clipboard?.writeText(`${dialog.user.username}\n${dialog.password}`).catch(() => {});
            setCopied(true);
          }}
        >
          {copied ? "انسخت" : "نسخ"}
        </button>
        <button className="btn btn-ghost" onClick={onClose}>
          تمام
        </button>
      </div>
    </Modal>
  );
}
