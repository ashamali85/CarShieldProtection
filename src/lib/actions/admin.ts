"use server";

import bcrypt from "bcryptjs";
import { and, eq, ne, sql } from "drizzle-orm";
import { redirect } from "next/navigation";
import { refresh } from "next/cache";
import { getDb, schema } from "@/db";
import { requirePermission, requireUser } from "@/lib/auth";
import { createSession } from "@/lib/session";
import type { ActionState } from "@/components/forms";
import type { ServiceCategory } from "@/db/schema";
import { canGrant, legacyRole, safeToChange } from "@/lib/roles";
import { intOrNull, kwdToFils, langFrom, str, t, UUID_RE } from "./helpers";

const CATEGORIES: ServiceCategory[] = ["ppf", "ceramic", "tint", "detailing", "other"];

export async function saveService(_: ActionState, formData: FormData): Promise<ActionState> {
  const lang = langFrom(formData);
  await requirePermission(lang, "services.manage");
  const dict = t(lang);
  const id = str(formData, "id");
  const nameEn = str(formData, "nameEn");
  const nameAr = str(formData, "nameAr");
  const category = str(formData, "category") as ServiceCategory;
  const priceFils = kwdToFils(str(formData, "price"));
  const warrantyMonths = intOrNull(str(formData, "warrantyMonths")) ?? 0;
  if (!nameEn || !nameAr || !CATEGORIES.includes(category) || priceFils === null || warrantyMonths < 0) {
    return { error: dict.common.required };
  }
  const values = { nameEn, nameAr, category, priceFils, warrantyMonths, active: formData.get("active") === "on" };

  const db = await getDb();
  if (UUID_RE.test(id)) {
    await db.update(schema.services).set(values).where(eq(schema.services.id, id));
  } else {
    await db.insert(schema.services).values(values);
  }
  redirect(`/${lang}/services`);
}

export async function createUser(_: ActionState, formData: FormData): Promise<ActionState> {
  const lang = langFrom(formData);
  const me = await requirePermission(lang, "users.manage");
  const dict = t(lang);
  const name = str(formData, "name");
  const email = str(formData, "email").toLowerCase();
  const password = str(formData, "password");
  const roleId = str(formData, "roleId");
  if (!name || !email || password.length < 8 || !UUID_RE.test(roleId)) return { error: dict.common.required };

  const db = await getDb();
  const [role] = await db.select().from(schema.roles).where(eq(schema.roles.id, roleId)).limit(1);
  if (!role) return { error: dict.common.required };
  if (!canGrant(me, role)) return { error: dict.users.notAllowed };
  const [taken] = await db.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.email, email)).limit(1);
  if (taken) return { error: dict.users.emailTaken };

  await db.insert(schema.users).values({ name, email, role: legacyRole(role), roleId, passwordHash: await bcrypt.hash(password, 10) });
  redirect(`/${lang}/users`);
}

export async function toggleUserActive(formData: FormData) {
  const lang = langFrom(formData);
  const me = await requirePermission(lang, "users.manage");
  const id = str(formData, "id");
  if (!UUID_RE.test(id) || id === me.id) return;
  const db = await getDb();
  const [u] = await db
    .select({ active: schema.users.active, roleId: schema.roles.id, system: schema.roles.system, permissions: schema.roles.permissions })
    .from(schema.users)
    .innerJoin(schema.roles, eq(schema.roles.id, schema.users.roleId))
    .where(eq(schema.users.id, id))
    .limit(1);
  // You can't switch off someone with more access than you.
  if (!u || !canGrant(me, u)) return;
  await db
    .update(schema.users)
    .set({ active: !u.active })
    // Deactivating an admin needs another active admin to remain.
    .where(and(ne(schema.users.id, me.id), safeToChange(id, u.roleId, u.system && u.active)));
  refresh();
}

/** Loads another user's role for the "can I act on them" checks. */
async function targetOf(id: string) {
  const db = await getDb();
  const [u] = await db
    .select({ id: schema.users.id, name: schema.users.name, roleId: schema.roles.id, system: schema.roles.system, permissions: schema.roles.permissions })
    .from(schema.users)
    .innerJoin(schema.roles, eq(schema.roles.id, schema.users.roleId))
    .where(eq(schema.users.id, id))
    .limit(1);
  return u;
}

/**
 * Deletes another user's account. Their past work stays (jobs, payments and so on simply no longer
 * name them). You can't delete yourself, anyone with more access than you, or the last active admin.
 */
export async function deleteUser(_: ActionState, formData: FormData): Promise<ActionState> {
  const lang = langFrom(formData);
  const me = await requirePermission(lang, "users.manage");
  const id = str(formData, "id");
  if (!UUID_RE.test(id) || id === me.id) return { error: t(lang).users.notAllowed };
  const target = await targetOf(id);
  if (!target || !canGrant(me, target)) return { error: t(lang).users.notAllowed };
  const db = await getDb();
  const done = await db.delete(schema.users).where(safeToChange(id, target.roleId, target.system)).returning({ id: schema.users.id });
  if (done.length === 0) return { error: t(lang).users.lastAdmin };
  refresh();
  return {};
}

/** Sets a new password for another user and signs them out everywhere. */
export async function resetUserPassword(_: ActionState, formData: FormData): Promise<ActionState> {
  const lang = langFrom(formData);
  const me = await requirePermission(lang, "users.manage");
  const U = t(lang).users;
  const id = str(formData, "id");
  const password = str(formData, "password");
  if (!UUID_RE.test(id) || id === me.id) return { error: U.notAllowed };
  if (password.length < 8) return { error: U.passwordShort };
  const target = await targetOf(id);
  if (!target || !canGrant(me, target)) return { error: U.notAllowed };
  const db = await getDb();
  await db
    .update(schema.users)
    .set({ passwordHash: await bcrypt.hash(password, 10), sessionVersion: sql`${schema.users.sessionVersion} + 1` })
    .where(eq(schema.users.id, id));
  return {};
}

/** Any signed-in user changes their own password (needs the current one). Other sessions are signed out. */
export async function changeOwnPassword(_: ActionState, formData: FormData): Promise<ActionState> {
  const lang = langFrom(formData);
  const me = await requireUser(lang);
  const U = t(lang).users;
  const current = str(formData, "current");
  const password = str(formData, "password");
  const confirm = str(formData, "confirm");
  if (password.length < 8) return { error: U.passwordShort };
  if (password !== confirm) return { error: U.passwordMismatch };
  const db = await getDb();
  const [row] = await db.select({ hash: schema.users.passwordHash }).from(schema.users).where(eq(schema.users.id, me.id)).limit(1);
  if (!row || !(await bcrypt.compare(current, row.hash))) return { error: U.currentWrong };
  const [updated] = await db
    .update(schema.users)
    .set({ passwordHash: await bcrypt.hash(password, 10), sessionVersion: sql`${schema.users.sessionVersion} + 1` })
    .where(eq(schema.users.id, me.id))
    .returning({ version: schema.users.sessionVersion });
  // Keep this browser signed in with the new version.
  await createSession(me.id, updated.version);
  return {};
}
