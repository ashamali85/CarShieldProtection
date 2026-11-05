import "server-only";
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
