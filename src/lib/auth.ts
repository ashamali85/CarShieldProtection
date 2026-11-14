import "server-only";
import { cache } from "react";
import { and, eq, gt } from "drizzle-orm";
import { redirect } from "next/navigation";
import { getDb, schema } from "@/db";
import { readSession } from "./session";
import type { Locale } from "@/i18n";
import { ALL_PERMISSIONS, normalizePermissions, type Permission } from "./permissions";

export type CurrentUser = {
  id: string;
  name: string;
  email: string;
  roleId: string;
  roleNameEn: string;
  roleNameAr: string;
  /** True for the built-in Admin role, which always has every permission. */
  isAdmin: boolean;
  permissions: ReadonlySet<Permission>;
};

/** Reads the session cookie and loads the user with their role once per request. */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const session = await readSession();
  if (!session) return null;
  const db = await getDb();
  const [user] = await db
    .select({
      id: schema.users.id,
      name: schema.users.name,
      email: schema.users.email,
      active: schema.users.active,
      sessionVersion: schema.users.sessionVersion,
      roleId: schema.roles.id,
      roleNameEn: schema.roles.nameEn,
      roleNameAr: schema.roles.nameAr,
      system: schema.roles.system,
      permissions: schema.roles.permissions,
    })
    .from(schema.users)
    .innerJoin(schema.roles, eq(schema.roles.id, schema.users.roleId))
    // The session must still exist on the server and not have expired.
    .innerJoin(schema.sessions, and(eq(schema.sessions.id, session.sid), eq(schema.sessions.userId, schema.users.id), gt(schema.sessions.expiresAt, new Date())))
    .where(eq(schema.users.id, session.userId))
    .limit(1);
  // Inactive users, and sessions from before a password change, are signed out.
  if (!user || !user.active || user.sessionVersion !== session.version) return null;
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    roleId: user.roleId,
    roleNameEn: user.roleNameEn,
    roleNameAr: user.roleNameAr,
    isAdmin: user.system,
    permissions: new Set(user.system ? ALL_PERMISSIONS : normalizePermissions(user.permissions)),
  };
});

export function can(user: CurrentUser | null | undefined, permission: Permission): boolean {
  return !!user && user.permissions.has(permission);
}

/** Use in every page body and Server Action: the proxy check alone is not authorization. */
export async function requireUser(lang: Locale): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect(`/${lang}/login`);
  return user;
}

/** Signed in and allowed to do `permission`; otherwise back to the dashboard with a notice. */
export async function requirePermission(lang: Locale, permission: Permission): Promise<CurrentUser> {
  const user = await requireUser(lang);
  if (!can(user, permission)) redirect(`/${lang}?denied=1`);
  return user;
}
