/**
 * سجل التعديلات. كل حفظ بيمر من withAudit، والسجل بينكتب بنفس الـ transaction:
 * إذا فشل الحفظ ما بينكتب سجل، وإذا فشل السجل الحفظ كله بيرجع.
 * الجدول نفسه محمي بمحفّز بقاعدة البيانات يمنع أي تعديل أو حذف.
 */
import { prisma as defaultPrisma, type Db, type Tx } from "./db";

export type AuditAction =
  | "CREATE"
  | "UPDATE"
  | "DELETE"
  | "RESTORE"
  | "LOGIN"
  | "LOGOUT"
  | "LOCKED"
  | "PASSWORD_RESET"
  | "PASSWORD_CHANGE"
  | "SESSIONS_REVOKED"
  | "IMPORT";

export interface AuditEntry {
  action: AuditAction;
  entity: string;
  entityId: string;
  field?: string | null;
  oldValue?: string | null;
  newValue?: string | null;
  note?: string | null;
}

/** حقول ما بتنكتب قيمتها بالسجل أبداً، بس إنها تغيرت */
const REDACTED_FIELDS = new Set(["passwordHash", "tokenHash", "password", "secret"]);
const REDACTED = "••••";

/** حقول تقنية ما إلها معنى بالسجل */
const IGNORED_FIELDS = new Set(["updatedAt", "createdAt", "failedLoginCount", "lockedUntil"]);

export function auditValue(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") return value;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint") return String(value);
  return JSON.stringify(value);
}

/** سطر لكل حقل تغيّرت قيمته */
export function diffFields(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
  fields?: readonly string[],
): Array<{ field: string; oldValue: string | null; newValue: string | null }> {
  const keys = fields ?? Array.from(new Set([...Object.keys(before), ...Object.keys(after)]));
  const out: Array<{ field: string; oldValue: string | null; newValue: string | null }> = [];
  for (const field of keys) {
    if (!fields && IGNORED_FIELDS.has(field)) continue;
    const oldValue = auditValue(before[field]);
    const newValue = auditValue(after[field]);
    if (oldValue === newValue) continue;
    if (REDACTED_FIELDS.has(field)) {
      out.push({ field, oldValue: REDACTED, newValue: REDACTED });
    } else {
      out.push({ field, oldValue, newValue });
    }
  }
  return out;
}

export class AuditRecorder {
  readonly entries: AuditEntry[] = [];

  /** إضافة كيان جديد: سطر واحد، والقيم كـ JSON بـ newValue */
  created(entity: string, entityId: string, values: Record<string, unknown>, note?: string): void {
    const shown: Record<string, string | null> = {};
    for (const r of diffFields({}, values)) shown[r.field] = r.newValue;
    this.entries.push({
      action: "CREATE",
      entity,
      entityId,
      newValue: Object.keys(shown).length ? JSON.stringify(shown) : null,
      note,
    });
  }

  /** تعديل: سطر لكل حقل تغيّر فعلاً. إذا ما تغيّر شي، ما بينكتب شي. */
  updated(
    entity: string,
    entityId: string,
    before: Record<string, unknown>,
    after: Record<string, unknown>,
    opts: { fields?: readonly string[]; note?: string } = {},
  ): number {
    const rows = diffFields(before, after, opts.fields);
    for (const r of rows) this.entries.push({ action: "UPDATE", entity, entityId, ...r, note: opts.note });
    return rows.length;
  }

  deleted(entity: string, entityId: string, note?: string): void {
    this.entries.push({ action: "DELETE", entity, entityId, note });
  }

  event(action: AuditAction, entity: string, entityId: string, note?: string): void {
    this.entries.push({ action, entity, entityId, note });
  }
}

/**
 * نفّذ تعديلات على قاعدة البيانات مع سجلها بعملية وحدة.
 *
 *   await withAudit(user.id, async (tx, audit) => {
 *     const before = await tx.user.findUniqueOrThrow({ where: { id } });
 *     const after = await tx.user.update({ where: { id }, data });
 *     audit.updated("User", id, before, after);
 *   });
 */
export async function withAudit<T>(
  actorId: string | null,
  fn: (tx: Tx, audit: AuditRecorder) => Promise<T>,
  db: Db = defaultPrisma,
  txOptions: { timeout?: number } = {},
): Promise<T> {
  return db.$transaction(async (tx) => {
    const audit = new AuditRecorder();
    const result = await fn(tx, audit);
    if (audit.entries.length > 0) {
      await tx.auditLog.createMany({
        data: audit.entries.map((e) => ({
          actorId,
          action: e.action,
          entity: e.entity,
          entityId: e.entityId,
          field: e.field ?? null,
          oldValue: e.oldValue ?? null,
          newValue: e.newValue ?? null,
          note: e.note ?? null,
        })),
      });
    }
    return result;
  }, txOptions);
}

/** حدث بدون تعديل بيانات (دخول، قفل...) */
export function logEvent(actorId: string | null, entry: AuditEntry, db: Db | Tx = defaultPrisma) {
  return db.auditLog.create({ data: { actorId, ...entry } });
}
