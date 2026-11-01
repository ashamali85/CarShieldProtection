import "server-only";
import { and, asc, eq, gte, inArray, lte, ne } from "drizzle-orm";
import { getDb, schema } from "@/db";
import type { Employee, HrSettings, LeaveType } from "@/db/schema";
import { todayKuwait } from "@/lib/dates";
import {
  annualLeaveEarned,
  applyPayTiers,
  calendarDays,
  completeMonths,
  computePayslip,
  daysInMonth,
  monthBounds,
  overlapDays,
} from "@/lib/hr";

type Db = Awaited<ReturnType<typeof getDb>>;

export const DEFAULT_HR_SETTINGS: HrSettings = {
  dailyRateDivisor: 26,
  hoursPerDay: 8,
  overtimeNormalPct: 125,
  overtimeRestDayPct: 150,
  overtimeHolidayPct: 200,
  pifss: {
    basicCapFils: 1_500_000,
    totalCapFils: 2_750_000,
    remunerationCapFils: 1_500_000,
    employee: { basic: 5, supplementary: 5, pensionIncrease: 2.5, unemployment: 0.5, remuneration: 2.5 },
    employer: { basic: 10, supplementary: 10, pensionIncrease: 1, unemployment: 0.5 },
  },
};

export async function getHrSettings(db?: Db): Promise<HrSettings> {
  const d = db ?? (await getDb());
  const [row] = await d.select().from(schema.hrSettings).where(eq(schema.hrSettings.id, 1)).limit(1);
  return row?.settings ?? DEFAULT_HR_SETTINGS;
}

/**
 * Annual leave is earned from the hire date, or from the day the employee was added to the
 * system if that is later — earlier leave is covered by the opening balance entered then.
 */
export function accrualStart(emp: Employee): string {
  const added = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kuwait" }).format(emp.createdAt);
  return added > emp.hireDate ? added : emp.hireDate;
}

/** Approved days of a leave type already used in the period that applies to a new request starting on `start`. */
async function usedInPeriod(db: Db, employeeId: string, type: LeaveType, start: string, excludeId?: string): Promise<number> {
  if (type.period === "event") return 0;
  const conds = [
    eq(schema.leaveRequests.employeeId, employeeId),
    eq(schema.leaveRequests.leaveTypeId, type.id),
    eq(schema.leaveRequests.status, "approved"),
  ];
  if (type.period === "year") {
    conds.push(gte(schema.leaveRequests.startDate, `${start.slice(0, 4)}-01-01`), lte(schema.leaveRequests.startDate, `${start.slice(0, 4)}-12-31`));
  }
  if (excludeId) conds.push(ne(schema.leaveRequests.id, excludeId));
  const rows = await db.select({ days: schema.leaveRequests.days }).from(schema.leaveRequests).where(and(...conds));
  return rows.reduce((a, r) => a + r.days, 0);
}

export type LeaveBalance = {
  type: LeaveType;
  /** Days allowed in the current period (annual: earned to date). Null = no limit. */
  allowance: number | null;
  used: number;
  available: number | null;
  eligible: boolean;
};

/** Leave position for one employee as of today, per active leave type that applies to them. */
export async function leaveBalances(db: Db, emp: Employee, asOf = todayKuwait()): Promise<LeaveBalance[]> {
  const types = await db.select().from(schema.leaveTypes).where(eq(schema.leaveTypes.active, true)).orderBy(asc(schema.leaveTypes.sortOrder));
  const approved = await db
    .select({ typeId: schema.leaveRequests.leaveTypeId, start: schema.leaveRequests.startDate, days: schema.leaveRequests.days })
    .from(schema.leaveRequests)
    .where(and(eq(schema.leaveRequests.employeeId, emp.id), eq(schema.leaveRequests.status, "approved")));
  const year = asOf.slice(0, 4);
  const months = completeMonths(emp.hireDate, asOf);
  return types
    .filter((t) => !t.femaleOnly || emp.gender === "female")
    .map((t) => {
      const mine = approved.filter((a) => a.typeId === t.id);
      const eligible = months >= t.minServiceMonths;
      if (t.period === "accrual") {
        const earned = annualLeaveEarned(t.allowanceDays ?? 0, accrualStart(emp), asOf, emp.leaveOpeningDays);
        const used = mine.reduce((a, r) => a + r.days, 0);
        return { type: t, allowance: earned, used, available: Math.round((earned - used) * 10) / 10, eligible };
      }
      const used = t.period === "year" ? mine.filter((m) => m.start.startsWith(year)).reduce((a, r) => a + r.days, 0) : t.period === "service" ? mine.reduce((a, r) => a + r.days, 0) : 0;
      const allowance = t.allowanceDays;
      return { type: t, allowance, used, available: allowance === null ? null : Math.max(0, allowance - used), eligible };
    });
}

export type LeaveCheck =
  | { ok: true; breakdown: { days: number; pct: number }[]; unpaidCentiDays: number }
  | { ok: false; error: "overlap" | "female" | "service" | "balance" | "inactive" | "locked"; n?: number };

/** Validates a leave request and works out how its days are paid. */
export async function evaluateLeave(
  db: Db,
  emp: Employee,
  type: LeaveType,
  start: string,
  end: string,
  days: number,
  opts: { excludeId?: string; checkBalance?: boolean } = {},
): Promise<LeaveCheck> {
  if (emp.status !== "active" && (!emp.endDate || start > emp.endDate)) return { ok: false, error: "inactive" };
  if (type.femaleOnly && emp.gender !== "female") return { ok: false, error: "female" };
  if (completeMonths(emp.hireDate, start) < type.minServiceMonths) return { ok: false, error: "service", n: type.minServiceMonths };

  const overlapConds = [
    eq(schema.leaveRequests.employeeId, emp.id),
    inArray(schema.leaveRequests.status, ["approved", "pending"] as const),
    lte(schema.leaveRequests.startDate, end),
    gte(schema.leaveRequests.endDate, start),
  ];
  if (opts.excludeId) overlapConds.push(ne(schema.leaveRequests.id, opts.excludeId));
  const [clash] = await db.select({ id: schema.leaveRequests.id }).from(schema.leaveRequests).where(and(...overlapConds)).limit(1);
  if (clash) return { ok: false, error: "overlap" };

  if (await touchesLockedPayroll(db, start, end)) return { ok: false, error: "locked" };

  if (type.period === "accrual" && opts.checkBalance !== false) {
    const earned = annualLeaveEarned(type.allowanceDays ?? 0, accrualStart(emp), start, emp.leaveOpeningDays);
    const used = await usedInPeriod(db, emp.id, type, start, opts.excludeId);
    const available = Math.floor(earned - used);
    if (days > available) return { ok: false, error: "balance", n: Math.max(0, available) };
  }
  const used = await usedInPeriod(db, emp.id, type, start, opts.excludeId);
  return { ok: true, ...applyPayTiers(type.payTiers, used, days) };
}

/** True if any month between start and end already has an approved or paid payroll run. */
export async function touchesLockedPayroll(db: Db, start: string, end: string): Promise<boolean> {
  const periods: { year: number; month: number }[] = [];
  let y = +start.slice(0, 4);
  let m = +start.slice(5, 7);
  const ey = +end.slice(0, 4);
  const em = +end.slice(5, 7);
  while (y < ey || (y === ey && m <= em)) {
    periods.push({ year: y, month: m });
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  const runs = await db
    .select({ year: schema.payrollRuns.year, month: schema.payrollRuns.month, status: schema.payrollRuns.status })
    .from(schema.payrollRuns)
    .where(inArray(schema.payrollRuns.year, [...new Set(periods.map((p) => p.year))]));
  return runs.some((r) => r.status !== "draft" && periods.some((p) => p.year === r.year && p.month === r.month));
}

/** Unpaid leave in a month, in hundredths of a day, spread by calendar overlap. */
async function unpaidLeaveInMonth(db: Db, employeeId: string, from: string, to: string): Promise<number> {
  const rows = await db
    .select({ start: schema.leaveRequests.startDate, end: schema.leaveRequests.endDate, unpaid: schema.leaveRequests.unpaidCentiDays })
    .from(schema.leaveRequests)
    .where(
      and(
        eq(schema.leaveRequests.employeeId, employeeId),
        eq(schema.leaveRequests.status, "approved"),
        lte(schema.leaveRequests.startDate, to),
        gte(schema.leaveRequests.endDate, from),
      ),
    );
  return Math.round(
    rows.reduce((a, r) => {
      if (r.unpaid === 0) return a;
      const span = calendarDays(r.start, r.end);
      return a + (r.unpaid * overlapDays(r.start, r.end, from, to)) / span;
    }, 0),
  );
}

type ManualInputs = {
  overtimeNormalCentiHours: number;
  overtimeRestCentiHours: number;
  overtimeHolidayCentiHours: number;
  bonusFils: number;
  absenceDays: number;
  otherDeductionFils: number;
  note: string | null;
};

const NO_INPUTS: ManualInputs = {
  overtimeNormalCentiHours: 0,
  overtimeRestCentiHours: 0,
  overtimeHolidayCentiHours: 0,
  bonusFils: 0,
  absenceDays: 0,
  otherDeductionFils: 0,
  note: null,
};

/** The payslip row for one employee in a month, from their current record, approved leave and any manual inputs. */
export async function buildPayslip(db: Db, emp: Employee, year: number, month: number, s: HrSettings, inputs: ManualInputs = NO_INPUTS) {
  const [from, to] = monthBounds(year, month);
  const lastDay = emp.endDate && emp.endDate < to ? emp.endDate : to;
  const firstDay = emp.hireDate > from ? emp.hireDate : from;
  const daysEmployed = overlapDays(firstDay, lastDay, from, to);
  const dim = daysInMonth(year, month);
  const unpaidLeaveCentiDays = await unpaidLeaveInMonth(db, emp.id, firstDay, lastDay);
  const amounts = computePayslip(
    {
      basicSalaryFils: emp.basicSalaryFils,
      housingAllowanceFils: emp.housingAllowanceFils,
      transportAllowanceFils: emp.transportAllowanceFils,
      otherAllowanceFils: emp.otherAllowanceFils,
      isKuwaiti: emp.isKuwaiti,
      pifssSalaryFils: emp.pifssSalaryFils,
      daysEmployed,
      daysInMonth: dim,
      unpaidLeaveCentiDays,
      ...inputs,
    },
    s,
  );
  return {
    employeeId: emp.id,
    employeeName: emp.fullName,
    jobTitle: emp.jobTitle,
    isKuwaiti: emp.isKuwaiti,
    iban: emp.iban,
    bankName: emp.bankName,
    daysEmployed,
    daysInMonth: dim,
    unpaidLeaveCentiDays,
    ...inputs,
    ...amounts,
  };
}

/** Employees on the books at any point in the month. */
export async function employeesInMonth(db: Db, year: number, month: number): Promise<Employee[]> {
  const [from, to] = monthBounds(year, month);
  const all = await db.select().from(schema.employees).where(lte(schema.employees.hireDate, to)).orderBy(asc(schema.employees.code));
  return all.filter((e) => !e.endDate || e.endDate >= from);
}
