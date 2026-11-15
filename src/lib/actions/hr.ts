"use server";

import { and, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { refresh } from "next/cache";
import { getDb, schema } from "@/db";
import type { HrSettings, PayTier, SeparationReason } from "@/db/schema";
import { requirePermission } from "@/lib/auth";
import type { ActionState } from "@/components/forms";
import { buildPayslip, employeesInMonth, evaluateLeave, getHrSettings, rebandLeave, touchesLockedPayroll } from "@/lib/hr-data";
import { calendarDays, computePayslip } from "@/lib/hr";
import { kwdToFils, langFrom, optStr, str, t, UUID_RE, validIban } from "./helpers";
import { audit, changes } from "@/lib/audit";

async function employeeName(id: string) {
  const db = await getDb();
  const [e] = await db.select({ name: schema.employees.fullName }).from(schema.employees).where(eq(schema.employees.id, id)).limit(1);
  return e?.name ?? null;
}
const monthLabel = (year: number, month: number) => `${year}-${String(month).padStart(2, "0")}`;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const isDate = (v: string) => ISO_DATE.test(v) && !Number.isNaN(Date.parse(v));
const optDate = (fd: FormData, k: string) => {
  const v = str(fd, k);
  return isDate(v) ? v : null;
};

/** "1.5" → 150 (hundredths). Empty → 0. Invalid → null. */
function centi(input: string): number | null {
  if (input === "") return 0;
  const n = Number(input.replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d))).replace(",", "."));
  return Number.isFinite(n) && n >= 0 && n <= 1_000_000 ? Math.round(n * 100) : null;
}

function fillN(template: string, n: number | string) {
  return template.replace("{n}", String(n));
}

// ── Employees ──────────────────────────────────────────────────────────────

const SEPARATION: SeparationReason[] = ["resignation", "termination", "contract_end", "retirement", "death", "other"];

export async function saveEmployee(_: ActionState, fd: FormData): Promise<ActionState> {
  const lang = langFrom(fd);
  await requirePermission(lang, "hr.manage");
  const e = t(lang).hr.employees;
  const id = str(fd, "id");

  const money = (k: string) => kwdToFils(str(fd, k));
  const basic = money("basic");
  const housing = money("housing");
  const transport = money("transport");
  const other = money("otherAllowance");
  const pifssRaw = str(fd, "pifssSalary");
  const pifssSalary = pifssRaw === "" ? null : kwdToFils(pifssRaw);
  if ([basic, housing, transport, other].some((v) => v === null) || (pifssRaw !== "" && pifssSalary === null)) return { error: e.invalidMoney };

  const fullName = str(fd, "fullName");
  const nationality = str(fd, "nationality");
  const jobTitle = str(fd, "jobTitle");
  const hireDate = str(fd, "hireDate");
  if (!fullName || !nationality || !jobTitle || !isDate(hireDate) || !basic) return { error: e.invalid };

  const opening = Number(str(fd, "leaveOpeningDays") || "0");
  const iban = optStr(fd, "iban")?.replace(/\s+/g, "").toUpperCase() ?? null;
  if (iban && !validIban(iban)) return { error: e.ibanInvalid };
  const userId = str(fd, "userId");
  const values = {
    fullName,
    fullNameAr: optStr(fd, "fullNameAr"),
    gender: str(fd, "gender") === "female" ? ("female" as const) : ("male" as const),
    nationality,
    isKuwaiti: fd.get("isKuwaiti") === "on",
    dateOfBirth: optDate(fd, "dateOfBirth"),
    phone: optStr(fd, "phone"),
    email: optStr(fd, "email"),
    jobTitle,
    department: optStr(fd, "department"),
    hireDate,
    contractType: str(fd, "contractType") === "fixed" ? ("fixed" as const) : ("unlimited" as const),
    contractEnd: optDate(fd, "contractEnd"),
    civilId: optStr(fd, "civilId"),
    civilIdExpiry: optDate(fd, "civilIdExpiry"),
    passportNo: optStr(fd, "passportNo"),
    passportExpiry: optDate(fd, "passportExpiry"),
    residencyExpiry: optDate(fd, "residencyExpiry"),
    basicSalaryFils: basic!,
    housingAllowanceFils: housing!,
    transportAllowanceFils: transport!,
    otherAllowanceFils: other!,
    pifssSalaryFils: pifssSalary,
    leaveOpeningDays: Number.isFinite(opening) && opening > 0 ? Math.min(Math.round(opening), 1000) : 0,
    bankName: optStr(fd, "bankName"),
    iban,
    userId: UUID_RE.test(userId) ? userId : null,
    notes: optStr(fd, "notes"),
  };

  const db = await getDb();
  if (UUID_RE.test(id)) {
    const [before] = await db.select().from(schema.employees).where(eq(schema.employees.id, id)).limit(1);
    await db.update(schema.employees).set(values).where(eq(schema.employees.id, id));
    // Personal documents (civil ID, passport, IBAN) are noted as changed without copying them into the log.
    const diff = changes(before, values, ["fullName", "fullNameAr", "nationality", "jobTitle", "department", "hireDate", "contractType", "contractEnd", "basicSalaryFils", "housingAllowanceFils", "transportAllowanceFils", "otherAllowanceFils", "pifssSalaryFils", "leaveOpeningDays", "phone", "email"]);
    for (const k of ["civilId", "passportNo", "iban", "bankName", "dateOfBirth", "civilIdExpiry", "passportExpiry", "residencyExpiry"] as const) {
      if (before && (before[k] ?? null) !== (values[k] ?? null)) diff[k] = "changed";
    }
    await audit("employee.update", { type: "employee", id, label: fullName }, diff);
    redirect(`/${lang}/hr/employees/${id}`);
  }
  const [row] = await db.insert(schema.employees).values(values).returning({ id: schema.employees.id });
  await audit("employee.create", { type: "employee", id: row.id, label: fullName }, { jobTitle, hireDate, basicSalaryFils: basic! });
  redirect(`/${lang}/hr/employees/${row.id}`);
}

export async function endService(_: ActionState, fd: FormData): Promise<ActionState> {
  const lang = langFrom(fd);
  await requirePermission(lang, "hr.manage");
  const id = str(fd, "id");
  const endDate = str(fd, "endDate");
  const reason = str(fd, "reason") as SeparationReason;
  const db = await getDb();
  const [emp] = UUID_RE.test(id) ? await db.select().from(schema.employees).where(eq(schema.employees.id, id)).limit(1) : [];
  if (!emp || !isDate(endDate) || endDate < emp.hireDate || !SEPARATION.includes(reason)) return { error: t(lang).hr.separation.invalid };
  await db.update(schema.employees).set({ status: "terminated", endDate, separationReason: reason }).where(eq(schema.employees.id, id));
  await audit("employee.endService", { type: "employee", id, label: emp.fullName }, { endDate, reason });
  refresh();
  return undefined;
}

export async function reinstateEmployee(fd: FormData) {
  const lang = langFrom(fd);
  await requirePermission(lang, "hr.manage");
  const id = str(fd, "id");
  if (!UUID_RE.test(id)) return;
  const db = await getDb();
  await db.update(schema.employees).set({ status: "active", endDate: null, separationReason: null }).where(eq(schema.employees.id, id));
  await audit("employee.reinstate", { type: "employee", id, label: await employeeName(id) });
  refresh();
}

// ── Leave ──────────────────────────────────────────────────────────────────

export async function recordLeave(_: ActionState, fd: FormData): Promise<ActionState> {
  const lang = langFrom(fd);
  const user = await requirePermission(lang, "hr.manage");
  const L = t(lang).hr.leave;
  const employeeId = str(fd, "employeeId");
  const typeId = str(fd, "leaveTypeId");
  const start = str(fd, "startDate");
  const end = str(fd, "endDate");
  if (!UUID_RE.test(employeeId) || !UUID_RE.test(typeId) || !isDate(start) || !isDate(end) || end < start) return { error: L.errors.invalid };
  const span = calendarDays(start, end);
  const days = Number(str(fd, "days") || span);
  if (!Number.isInteger(days) || days < 1 || days > span) return { error: L.errors.invalid };
  const status = str(fd, "status") === "pending" ? ("pending" as const) : ("approved" as const);

  const db = await getDb();
  const [[emp], [type]] = await Promise.all([
    db.select().from(schema.employees).where(eq(schema.employees.id, employeeId)).limit(1),
    db.select().from(schema.leaveTypes).where(eq(schema.leaveTypes.id, typeId)).limit(1),
  ]);
  if (!emp || !type) return { error: L.errors.invalid };
  const check = await evaluateLeave(db, emp, type, start, end, days, { checkBalance: true });
  if (!check.ok) return { error: fillN(L.errors[check.error], check.n ?? "") };

  await db.insert(schema.leaveRequests).values({
    employeeId,
    leaveTypeId: typeId,
    startDate: start,
    endDate: end,
    days,
    status,
    reason: optStr(fd, "reason"),
    payBreakdown: status === "approved" ? check.breakdown : null,
    unpaidCentiDays: status === "approved" ? check.unpaidCentiDays : 0,
    createdById: user.id,
    decidedById: status === "approved" ? user.id : null,
    decidedAt: status === "approved" ? new Date() : null,
  });
  if (status === "approved") await rebandLeave(db, employeeId, type);
  await audit("leave.record", { type: "employee", id: employeeId, label: emp.fullName }, { kind: type.nameEn, period: `${start} – ${end}`, days, status });
  const back = str(fd, "back");
  redirect(back.startsWith(`/${lang}/hr/`) ? back : `/${lang}/hr/leave`);
}

export async function decideLeave(_: ActionState, fd: FormData): Promise<ActionState> {
  const lang = langFrom(fd);
  const user = await requirePermission(lang, "hr.manage");
  const L = t(lang).hr.leave;
  const id = str(fd, "id");
  const decision = str(fd, "decision");
  if (!UUID_RE.test(id) || !["approved", "rejected", "cancelled"].includes(decision)) return { error: L.errors.invalid };
  const db = await getDb();
  const [req] = await db.select().from(schema.leaveRequests).where(eq(schema.leaveRequests.id, id)).limit(1);
  if (!req) return { error: L.errors.invalid };

  if (decision === "approved") {
    if (req.status !== "pending") return undefined;
    const [[emp], [type]] = await Promise.all([
      db.select().from(schema.employees).where(eq(schema.employees.id, req.employeeId)).limit(1),
      db.select().from(schema.leaveTypes).where(eq(schema.leaveTypes.id, req.leaveTypeId)).limit(1),
    ]);
    if (!emp || !type) return { error: L.errors.invalid };
    const check = await evaluateLeave(db, emp, type, req.startDate, req.endDate, req.days, { excludeId: req.id });
    if (!check.ok) return { error: fillN(L.errors[check.error], check.n ?? "") };
    await db
      .update(schema.leaveRequests)
      .set({ status: "approved", payBreakdown: check.breakdown, unpaidCentiDays: check.unpaidCentiDays, decidedById: user.id, decidedAt: new Date() })
      .where(and(eq(schema.leaveRequests.id, id), eq(schema.leaveRequests.status, "pending")));
  } else {
    if (req.status === "approved") {
      if (await touchesLockedPayroll(db, req.startDate, req.endDate)) return { error: L.errors.locked };
    }
    await db
      .update(schema.leaveRequests)
      .set({ status: decision as "rejected" | "cancelled", unpaidCentiDays: 0, decidedById: user.id, decidedAt: new Date() })
      .where(eq(schema.leaveRequests.id, id));
  }
  await audit("leave.decide", { type: "employee", id: req.employeeId, label: await employeeName(req.employeeId) }, { period: `${req.startDate} – ${req.endDate}`, days: req.days, status: [req.status, decision] });
  // Pay bands of this employee's other leave of the same type may shift (e.g. after a cancellation).
  const [type] = await db.select().from(schema.leaveTypes).where(eq(schema.leaveTypes.id, req.leaveTypeId)).limit(1);
  if (type) await rebandLeave(db, req.employeeId, type);
  refresh();
  return undefined;
}

// ── Payroll ────────────────────────────────────────────────────────────────

export async function startPayroll(_: ActionState, fd: FormData): Promise<ActionState> {
  const lang = langFrom(fd);
  const user = await requirePermission(lang, "hr.manage");
  const P = t(lang).hr.payroll;
  const period = str(fd, "period"); // YYYY-MM
  if (!/^\d{4}-\d{2}$/.test(period)) return { error: P.invalidNumber };
  const year = +period.slice(0, 4);
  const month = +period.slice(5, 7);
  if (month < 1 || month > 12) return { error: P.invalidNumber };

  const db = await getDb();
  const [existing] = await db
    .select({ id: schema.payrollRuns.id })
    .from(schema.payrollRuns)
    .where(and(eq(schema.payrollRuns.year, year), eq(schema.payrollRuns.month, month)))
    .limit(1);
  if (existing) return { error: P.exists };
  const emps = await employeesInMonth(db, year, month);
  if (emps.length === 0) return { error: P.noEmployees };

  const s = await getHrSettings(db);
  const [run] = await db.insert(schema.payrollRuns).values({ year, month, createdById: user.id }).returning({ id: schema.payrollRuns.id });
  const rows = [];
  for (const e of emps) rows.push({ runId: run.id, ...(await buildPayslip(db, e, year, month, s)) });
  await db.insert(schema.payslips).values(rows);
  await audit("payroll.start", { type: "payroll", id: run.id, label: monthLabel(year, month) }, { employees: rows.length });
  redirect(`/${lang}/hr/payroll/${run.id}`);
}

async function draftRun(db: Awaited<ReturnType<typeof getDb>>, runId: string) {
  const [run] = await db.select().from(schema.payrollRuns).where(eq(schema.payrollRuns.id, runId)).limit(1);
  return run && run.status === "draft" ? run : null;
}

/** Rebuilds every payslip in a draft run from current employee data and approved leave, keeping manual entries. */
export async function recalcPayroll(_: ActionState, fd: FormData): Promise<ActionState> {
  const lang = langFrom(fd);
  await requirePermission(lang, "hr.manage");
  const id = str(fd, "id");
  const db = await getDb();
  const run = UUID_RE.test(id) ? await draftRun(db, id) : null;
  if (!run) return { error: t(lang).hr.payroll.lockedHint };
  const s = await getHrSettings(db);
  const [slips, emps] = await Promise.all([
    db.select().from(schema.payslips).where(eq(schema.payslips.runId, id)),
    employeesInMonth(db, run.year, run.month),
  ]);
  const byEmp = new Map(slips.map((p) => [p.employeeId, p]));
  for (const e of emps) {
    const prev = byEmp.get(e.id);
    const inputs = prev
      ? {
          overtimeNormalCentiHours: prev.overtimeNormalCentiHours,
          overtimeRestCentiHours: prev.overtimeRestCentiHours,
          overtimeHolidayCentiHours: prev.overtimeHolidayCentiHours,
          bonusFils: prev.bonusFils,
          absenceDays: prev.absenceDays,
          otherDeductionFils: prev.otherDeductionFils,
          note: prev.note,
        }
      : undefined;
    const row = await buildPayslip(db, e, run.year, run.month, s, inputs);
    if (prev) await db.update(schema.payslips).set(row).where(eq(schema.payslips.id, prev.id));
    else await db.insert(schema.payslips).values({ runId: id, ...row });
    byEmp.delete(e.id);
  }
  // Employees no longer in the month (e.g. hire date moved) drop out of the draft.
  for (const stale of byEmp.values()) await db.delete(schema.payslips).where(eq(schema.payslips.id, stale.id));
  await audit("payroll.recalc", { type: "payroll", id, label: monthLabel(run.year, run.month) }, { employees: emps.length });
  refresh();
  return undefined;
}

export async function adjustPayslip(_: ActionState, fd: FormData): Promise<ActionState> {
  const lang = langFrom(fd);
  await requirePermission(lang, "hr.manage");
  const P = t(lang).hr.payroll;
  const id = str(fd, "id");
  const db = await getDb();
  const [slip] = UUID_RE.test(id) ? await db.select().from(schema.payslips).where(eq(schema.payslips.id, id)).limit(1) : [];
  if (!slip || !(await draftRun(db, slip.runId))) return { error: P.lockedHint };

  const otN = centi(str(fd, "otNormal"));
  const otR = centi(str(fd, "otRest"));
  const otH = centi(str(fd, "otHoliday"));
  const absenceC = centi(str(fd, "absence"));
  const bonus = kwdToFils(str(fd, "bonus"));
  const otherDed = kwdToFils(str(fd, "otherDeduction"));
  if ([otN, otR, otH, absenceC, bonus, otherDed].some((v) => v === null) || absenceC! % 100 !== 0) return { error: P.invalidNumber };
  const absenceDays = absenceC! / 100;
  if (absenceDays > slip.daysEmployed) return { error: P.invalidNumber };

  const [emp] = await db.select().from(schema.employees).where(eq(schema.employees.id, slip.employeeId)).limit(1);
  const s = await getHrSettings(db);
  const amounts = computePayslip(
    {
      basicSalaryFils: emp.basicSalaryFils,
      housingAllowanceFils: emp.housingAllowanceFils,
      transportAllowanceFils: emp.transportAllowanceFils,
      otherAllowanceFils: emp.otherAllowanceFils,
      isKuwaiti: emp.isKuwaiti,
      pifssSalaryFils: emp.pifssSalaryFils,
      daysEmployed: slip.daysEmployed,
      daysInMonth: slip.daysInMonth,
      unpaidLeaveCentiDays: slip.unpaidLeaveCentiDays,
      overtimeNormalCentiHours: otN!,
      overtimeRestCentiHours: otR!,
      overtimeHolidayCentiHours: otH!,
      bonusFils: bonus!,
      absenceDays,
      otherDeductionFils: otherDed!,
    },
    s,
  );
  await db
    .update(schema.payslips)
    .set({
      overtimeNormalCentiHours: otN!,
      overtimeRestCentiHours: otR!,
      overtimeHolidayCentiHours: otH!,
      bonusFils: bonus!,
      absenceDays,
      otherDeductionFils: otherDed!,
      note: optStr(fd, "note"),
      ...amounts,
    })
    .where(eq(schema.payslips.id, id));
  const run = await draftRun(db, slip.runId);
  await audit(
    "payroll.adjust",
    { type: "payroll", id: slip.runId, label: `${run ? monthLabel(run.year, run.month) : ""} · ${emp.fullName}` },
    changes(slip, { bonusFils: bonus!, otherDeductionFils: otherDed!, absenceDays, overtimeNormalCentiHours: otN!, overtimeRestCentiHours: otR!, overtimeHolidayCentiHours: otH! }, ["bonusFils", "otherDeductionFils", "absenceDays", "overtimeNormalCentiHours", "overtimeRestCentiHours", "overtimeHolidayCentiHours"]),
  );
  refresh();
  return undefined;
}

export async function setPayrollStatus(_: ActionState, fd: FormData): Promise<ActionState> {
  const lang = langFrom(fd);
  await requirePermission(lang, "hr.manage");
  const id = str(fd, "id");
  const to = str(fd, "to");
  if (!UUID_RE.test(id)) return undefined;
  const db = await getDb();
  const [run] = await db.select().from(schema.payrollRuns).where(eq(schema.payrollRuns.id, id)).limit(1);
  if (!run) return undefined;
  const allowed: Record<string, string[]> = { draft: ["approved"], approved: ["draft", "paid"], paid: ["approved"] };
  if (!allowed[run.status]?.includes(to)) return undefined;
  await db
    .update(schema.payrollRuns)
    .set({
      status: to as "draft" | "approved" | "paid",
      approvedAt: to === "approved" ? new Date() : to === "draft" ? null : run.approvedAt,
      paidAt: to === "paid" ? new Date() : null,
    })
    .where(eq(schema.payrollRuns.id, id));
  await audit("payroll.status", { type: "payroll", id, label: monthLabel(run.year, run.month) }, { status: [run.status, to] });
  refresh();
  return undefined;
}

export async function deletePayroll(_: ActionState, fd: FormData): Promise<ActionState> {
  const lang = langFrom(fd);
  await requirePermission(lang, "hr.manage");
  const id = str(fd, "id");
  const db = await getDb();
  const run = UUID_RE.test(id) ? await draftRun(db, id) : null;
  if (!run) return { error: t(lang).hr.payroll.lockedHint };
  await db.delete(schema.payrollRuns).where(eq(schema.payrollRuns.id, id));
  await audit("payroll.delete", { type: "payroll", label: monthLabel(run.year, run.month) });
  redirect(`/${lang}/hr/payroll`);
}

// ── Settings ───────────────────────────────────────────────────────────────

export async function saveHrSettings(_: ActionState, fd: FormData): Promise<ActionState> {
  const lang = langFrom(fd);
  await requirePermission(lang, "hr.manage");
  const S = t(lang).hr.settings;
  const num = (k: string) => {
    const v = Number(str(fd, k));
    return str(fd, k) !== "" && Number.isFinite(v) && v >= 0 ? v : NaN;
  };
  const pct = (k: string) => {
    const v = num(k);
    return v <= 100 ? v : NaN;
  };
  const kwd = (k: string) => kwdToFils(str(fd, k)) ?? NaN;
  const settings: HrSettings = {
    dailyRateDivisor: num("dailyRateDivisor"),
    hoursPerDay: num("hoursPerDay"),
    overtimeNormalPct: num("overtimeNormalPct"),
    overtimeRestDayPct: num("overtimeRestDayPct"),
    overtimeHolidayPct: num("overtimeHolidayPct"),
    pifss: {
      basicCapFils: kwd("basicCap"),
      totalCapFils: kwd("totalCap"),
      remunerationCapFils: kwd("remunerationCap"),
      employee: { basic: pct("ee_basic"), supplementary: pct("ee_supplementary"), pensionIncrease: pct("ee_pensionIncrease"), unemployment: pct("ee_unemployment"), remuneration: pct("ee_remuneration") },
      employer: { basic: pct("er_basic"), supplementary: pct("er_supplementary"), pensionIncrease: pct("er_pensionIncrease"), unemployment: pct("er_unemployment") },
    },
  };
  const flat = [
    settings.dailyRateDivisor,
    settings.hoursPerDay,
    settings.overtimeNormalPct,
    settings.overtimeRestDayPct,
    settings.overtimeHolidayPct,
    settings.pifss.basicCapFils,
    settings.pifss.totalCapFils,
    settings.pifss.remunerationCapFils,
    ...Object.values(settings.pifss.employee),
    ...Object.values(settings.pifss.employer),
  ];
  if (flat.some((v) => Number.isNaN(v)) || settings.dailyRateDivisor < 1 || settings.hoursPerDay < 1 || settings.pifss.totalCapFils < settings.pifss.basicCapFils) {
    return { error: S.invalid };
  }
  const db = await getDb();
  // Each setting that changed, as "pifss.employee.basic: 10.5 → 11".
  const flatten = (o: object, pre = ""): Record<string, number> =>
    Object.entries(o).reduce((acc, [k, v]) => ({ ...acc, ...(typeof v === "object" && v ? flatten(v, `${pre}${k}.`) : { [`${pre}${k}`]: v }) }), {});
  const was = flatten(await getHrSettings(db));
  const now = flatten(settings);
  await audit("hr.settings", null, Object.fromEntries(Object.keys(now).filter((k) => was[k] !== now[k]).map((k) => [k, [was[k] ?? null, now[k]]])));
  await db
    .insert(schema.hrSettings)
    .values({ id: 1, settings })
    .onConflictDoUpdate({ target: schema.hrSettings.id, set: { settings, updatedAt: new Date() } });
  refresh();
  return undefined;
}

export async function saveLeaveType(_: ActionState, fd: FormData): Promise<ActionState> {
  const lang = langFrom(fd);
  await requirePermission(lang, "hr.manage");
  const S = t(lang).hr.settings;
  const id = str(fd, "id");
  const nameEn = str(fd, "nameEn");
  const nameAr = str(fd, "nameAr");
  const allowRaw = str(fd, "allowanceDays");
  const allowanceDays = allowRaw === "" ? null : Number(allowRaw);
  const minService = Number(str(fd, "minServiceMonths") || "0");
  const pctRaw = str(fd, "payPct");
  const payPct = pctRaw === "" ? null : Number(pctRaw);
  const period = str(fd, "period") as "year" | "service" | "accrual" | "event";
  if (
    !nameEn ||
    !nameAr ||
    (allowanceDays !== null && (!Number.isInteger(allowanceDays) || allowanceDays < 0)) ||
    !Number.isInteger(minService) ||
    minService < 0 ||
    (payPct !== null && (!Number.isFinite(payPct) || payPct < 0 || payPct > 100)) ||
    !["year", "service", "accrual", "event"].includes(period)
  ) {
    return { error: S.invalid };
  }
  const db = await getDb();
  const common = { nameEn, nameAr, allowanceDays, minServiceMonths: minService, period, femaleOnly: fd.get("femaleOnly") === "on", active: fd.get("active") === "on" };

  if (UUID_RE.test(id)) {
    const [cur] = await db.select().from(schema.leaveTypes).where(eq(schema.leaveTypes.id, id)).limit(1);
    if (!cur) return { error: S.invalid };
    // Single-band types can have their pay % edited; multi-band ones (sick leave) keep their bands.
    let payTiers: PayTier[] = cur.payTiers;
    if (payPct !== null && cur.payTiers.length === 1) payTiers = [{ days: allowanceDays, pct: payPct }];
    else if (cur.payTiers.length === 1) payTiers = [{ days: allowanceDays, pct: cur.payTiers[0].pct }];
    await db.update(schema.leaveTypes).set({ ...common, payTiers }).where(eq(schema.leaveTypes.id, id));
    await audit("hr.leaveType", { type: "leaveType", id, label: nameEn }, changes(cur, common, ["nameEn", "nameAr", "allowanceDays", "minServiceMonths", "period", "femaleOnly", "active"]));
  } else {
    const code = nameEn
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_|_$/g, "")
      .slice(0, 40);
    const [row] = await db
      .insert(schema.leaveTypes)
      .values({ ...common, code: code || `type_${Date.now()}`, active: true, payTiers: [{ days: allowanceDays, pct: payPct ?? 100 }], sortOrder: 50 })
      .onConflictDoNothing()
      .returning({ id: schema.leaveTypes.id });
    if (!row) return { error: S.typeExists };
    await audit("hr.leaveType", { type: "leaveType", id: row.id, label: nameEn }, { allowanceDays, period });
  }
  refresh();
  return undefined;
}
