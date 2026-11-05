"use server";

import { and, count, eq, ne, or } from "drizzle-orm";
import { redirect } from "next/navigation";
import { refresh } from "next/cache";
import { getDb, schema } from "@/db";
import { requirePermission } from "@/lib/auth";
import { canGrant } from "@/lib/roles";
import { normalizePermissions } from "@/lib/permissions";
import type { ActionState } from "@/components/forms";
import { langFrom, str, t, UUID_RE } from "./helpers";

export async function saveRole(_: ActionState, fd: FormData): Promise<ActionState> {
  const lang = langFrom(fd);
  const me = await requirePermission(lang, "roles.manage");
  const R = t(lang).roles;
  const id = str(fd, "id");
  const nameEn = str(fd, "nameEn");
  const nameAr = str(fd, "nameAr");
  if (!nameEn || !nameAr) return { error: R.invalid };
  let permissions = normalizePermissions(fd.getAll("perm").map(String));
  const db = await getDb();
  // A new role can start as a copy of another one (keeping only what you're allowed to give).
  const copyFrom = str(fd, "copyFrom");
  if (!UUID_RE.test(id) && UUID_RE.test(copyFrom)) {
    const [src] = await db.select().from(schema.roles).where(eq(schema.roles.id, copyFrom)).limit(1);
    if (src) permissions = normalizePermissions((src.system ? [...me.permissions] : src.permissions).filter((p) => me.permissions.has(p as never)));
  }
  if (!permissions.every((p) => me.permissions.has(p))) return { error: t(lang).users.notAllowed };
  const [clash] = await db
    .select({ id: schema.roles.id })
    .from(schema.roles)
    .where(and(or(eq(schema.roles.nameEn, nameEn), eq(schema.roles.nameAr, nameAr)), UUID_RE.test(id) ? ne(schema.roles.id, id) : undefined))
    .limit(1);
  if (clash) return { error: R.exists };

  if (UUID_RE.test(id)) {
    const [role] = await db.select().from(schema.roles).where(eq(schema.roles.id, id)).limit(1);
    if (!role) return { error: R.invalid };
    if (role.system || !(canGrant(me, role))) return { error: t(lang).users.notAllowed };
    await db.update(schema.roles).set({ nameEn, nameAr, permissions }).where(eq(schema.roles.id, id));
    refresh();
    return undefined;
  }
  const key = `${nameEn.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 30) || "role"}_${Date.now().toString(36)}`;
  const [row] = await db.insert(schema.roles).values({ key, nameEn, nameAr, permissions }).returning({ id: schema.roles.id });
  redirect(`/${lang}/roles/${row.id}`);
}

export async function deleteRole(_: ActionState, fd: FormData): Promise<ActionState> {
  const lang = langFrom(fd);
  const me = await requirePermission(lang, "roles.manage");
  const id = str(fd, "id");
  if (!UUID_RE.test(id)) return undefined;
  const db = await getDb();
  const [role] = await db.select().from(schema.roles).where(eq(schema.roles.id, id)).limit(1);
  if (!role || role.system || !(canGrant(me, role))) return { error: t(lang).users.notAllowed };
  const [{ n }] = await db.select({ n: count() }).from(schema.users).where(eq(schema.users.roleId, id));
  if (n > 0) return { error: t(lang).roles.inUse };
  await db.delete(schema.roles).where(eq(schema.roles.id, id));
  redirect(`/${lang}/roles`);
}

/** Moves another user to a different role. Both their current and their new role must be within your own access. */
export async function setUserRole(_: ActionState, fd: FormData): Promise<ActionState> {
  const lang = langFrom(fd);
  const me = await requirePermission(lang, "users.manage");
  const id = str(fd, "id");
  const roleId = str(fd, "roleId");
  if (!UUID_RE.test(id) || !UUID_RE.test(roleId) || id === me.id) return { error: t(lang).users.notAllowed };
  const db = await getDb();
  const [target] = await db
    .select({ system: schema.roles.system, permissions: schema.roles.permissions })
    .from(schema.users)
    .innerJoin(schema.roles, eq(schema.roles.id, schema.users.roleId))
    .where(eq(schema.users.id, id))
    .limit(1);
  const [role] = await db.select().from(schema.roles).where(eq(schema.roles.id, roleId)).limit(1);
  if (!target || !role || !(canGrant(me, target)) || !(canGrant(me, role))) return { error: t(lang).users.notAllowed };
  await db.update(schema.users).set({ roleId }).where(eq(schema.users.id, id));
  refresh();
  return undefined;
}
