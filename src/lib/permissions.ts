/**
 * Access permissions. Each area of the app has a "view" permission (see its pages) and one or
 * more action permissions. Granting an action permission also grants the area's view permission.
 * Pure module (no server imports) so client components can use the list too.
 */
export const PERMISSION_AREAS = [
  { area: "jobs", perms: ["jobs.view", "jobs.manage"] },
  { area: "customers", perms: ["customers.view", "customers.manage"] },
  { area: "warranties", perms: ["warranties.view"] },
  { area: "invoices", perms: ["invoices.view", "invoices.manage", "invoices.adjust"] },
  { area: "inventory", perms: ["inventory.view", "inventory.receive", "inventory.manage"] },
  { area: "services", perms: ["services.view", "services.manage"] },
  { area: "catalog", perms: ["catalog.manage"] },
  { area: "finance", perms: ["finance.view", "finance.manage"] },
  { area: "hr", perms: ["hr.view", "hr.manage"] },
  { area: "users", perms: ["users.manage", "roles.manage"] },
] as const;

export type PermissionArea = (typeof PERMISSION_AREAS)[number]["area"];
export type Permission = (typeof PERMISSION_AREAS)[number]["perms"][number];

export const ALL_PERMISSIONS: Permission[] = PERMISSION_AREAS.flatMap((a) => [...a.perms]);
const KNOWN = new Set<string>(ALL_PERMISSIONS);

/** Keeps known permissions only, adds the view permission an action implies, in a stable order. */
export function normalizePermissions(input: Iterable<string>): Permission[] {
  const set = new Set<string>();
  for (const p of input) if (KNOWN.has(p)) set.add(p);
  for (const a of PERMISSION_AREAS) {
    const view = a.perms.find((p) => p.endsWith(".view"));
    if (view && a.perms.some((p) => p !== view && set.has(p))) set.add(view);
  }
  return ALL_PERMISSIONS.filter((p) => set.has(p));
}

/** What every role had before roles could be edited: everything except the admin-only areas. */
export const FRONT_DESK_DEFAULT: Permission[] = normalizePermissions([
  "jobs.manage",
  "customers.manage",
  "warranties.view",
  "invoices.manage",
  "inventory.view",
  "inventory.receive",
  "services.view",
]);
