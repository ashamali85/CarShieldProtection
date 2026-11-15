/** Which actions belong to each area of the audit log filter (by the action's first part). Pure module. */
export const AUDIT_AREAS = {
  auth: ["auth"],
  users: ["user", "role", "training"],
  jobs: ["job"],
  invoices: ["invoice"],
  customers: ["customer", "vehicle"],
  catalog: ["service", "catalog"],
  inventory: ["inventory"],
  finance: ["expense", "cash", "finance", "contract"],
  hr: ["employee", "leave", "payroll", "hr"],
} as const;

export type AuditArea = keyof typeof AUDIT_AREAS;

export function areaOf(action: string): AuditArea | null {
  const prefix = action.split(".")[0];
  for (const [area, prefixes] of Object.entries(AUDIT_AREAS)) if ((prefixes as readonly string[]).includes(prefix)) return area as AuditArea;
  return null;
}
