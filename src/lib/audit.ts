import "server-only";
import { headers } from "next/headers";
import { getDb, schema, type Db } from "@/db";
import { getCurrentUser } from "@/lib/auth";
import type { Dictionary } from "@/i18n";

/** Every action that can appear in the audit log (each has an English and Arabic label). */
export type AuditAction = keyof Dictionary["audit"]["actions"];

export type AuditTarget = {
  /** What kind of record: used to link the entry to its page. */
  type: "job" | "invoice" | "customer" | "vehicle" | "service" | "make" | "model" | "inventory" | "user" | "role" | "expense" | "cash" | "contract" | "employee" | "leave" | "payroll" | "category" | "leaveType";
  id?: string | null;
  /** How people know it: a job code, a name, an email. */
  label?: string | null;
};

type Value = string | number | boolean | null | undefined | string[];
/** Extra facts. A [before, after] pair shows as a change. Never pass passwords. */
export type AuditDetails = Record<string, Value | [Value, Value]>;

type Actor = { id: string; name: string; email: string } | null;

async function clientIp(): Promise<string | null> {
  const h = await headers();
  return h.get("x-real-ip") ?? h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
}

/**
 * Adds an entry to the audit log of the database the person is working in (the training copy keeps
 * its own). The person defaults to whoever is signed in. A logging problem never stops the action.
 */
export async function audit(action: AuditAction, target?: AuditTarget | null, details?: AuditDetails, opts: { db?: Db; actor?: Actor } = {}) {
  try {
    const actor = opts.actor !== undefined ? opts.actor : await getCurrentUser();
    const db = opts.db ?? (await getDb());
    const clean = details ? Object.fromEntries(Object.entries(details).filter(([, v]) => v !== undefined)) : null;
    await db.insert(schema.auditLog).values({
      userId: actor?.id ?? null,
      userName: actor?.name ?? null,
      userEmail: actor?.email ?? null,
      action,
      entityType: target?.type ?? null,
      entityId: target?.id ?? null,
      entityLabel: target?.label?.slice(0, 300) ?? null,
      details: clean && Object.keys(clean).length > 0 ? clean : null,
      ip: await clientIp(),
    });
  } catch (err) {
    console.error("audit log write failed", action, err);
  }
}

/** The fields that differ between two versions of a record, as [before, after] pairs. */
export function changes<T extends Record<string, unknown>>(before: T | undefined, after: Partial<T>, fields: (keyof T & string)[]): AuditDetails {
  const out: AuditDetails = {};
  if (!before) return out;
  for (const f of fields) {
    if (!(f in after)) continue;
    const a = norm(before[f]);
    const b = norm(after[f]);
    if (JSON.stringify(a) !== JSON.stringify(b)) out[f] = [a, b];
  }
  return out;
}

function norm(v: unknown): Value {
  if (v instanceof Date) return v.toISOString();
  if (Array.isArray(v)) return v.map(String);
  if (v === null || v === undefined || typeof v === "string" || typeof v === "number" || typeof v === "boolean") return v ?? null;
  return JSON.stringify(v);
}
