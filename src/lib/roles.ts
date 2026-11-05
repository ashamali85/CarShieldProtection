import "server-only";
import { and, eq, sql, type SQL } from "drizzle-orm";
import { schema } from "@/db";
import type { Role } from "@/db/schema";
import type { CurrentUser } from "@/lib/auth";
import { normalizePermissions } from "@/lib/permissions";

/**
 * No one can hand out access they don't have: a role can be given (or edited) only by someone who
 * already holds every permission in it, and the built-in Admin role only by an admin.
 */
export function canGrant(me: CurrentUser, role: Pick<Role, "system" | "permissions">): boolean {
  if (role.system) return me.isAdmin;
  return normalizePermissions(role.permissions).every((p) => me.permissions.has(p));
}

/**
 * SQL condition for changing or deactivating a user: their role must still be the one that was
 * checked, and if it's the Admin role at least one other active admin must remain. Putting this in
 * the UPDATE's WHERE closes the gap between checking and writing.
 */
export function safeToChange(userId: string, checkedRoleId: string, checkedIsAdmin: boolean): SQL {
  const sameRole = and(eq(schema.users.id, userId), eq(schema.users.roleId, checkedRoleId))!;
  if (!checkedIsAdmin) return sameRole;
  return and(
    sameRole,
    sql`exists (select 1 from ${schema.users} u join ${schema.roles} r on r.id = u.role_id where r.system and u.active and u.id <> ${userId})`,
  )!;
}

/** The old fixed-role column, kept in step so it never says "admin" for someone who isn't. */
export function legacyRole(role: { key: string; system: boolean }): "admin" | "staff" | "technician" {
  return role.system ? "admin" : role.key === "technician" ? "technician" : "staff";
}
