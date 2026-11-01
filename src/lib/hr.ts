/**
 * HR calculations: service length, PIFSS, end-of-service indemnity, leave pay bands and payslips.
 * Pure functions (no database access) so they can be tested in isolation.
 * All money is integer fils; dates are "YYYY-MM-DD" strings.
 */
import type { HrSettings, PayTier, SeparationReason } from "@/db/schema";

// ── Dates ──────────────────────────────────────────────────────────────────

const DAY = 86_400_000;
const toUtc = (iso: string) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10));
const fromUtc = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/** Inclusive number of calendar days from a to b (0 if b is before a). */
export function calendarDays(a: string, b: string): number {
  return Math.max(0, Math.round((toUtc(b) - toUtc(a)) / DAY) + 1);
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function monthBounds(year: number, month: number): [string, string] {
  const m = String(month).padStart(2, "0");
  return [`${year}-${m}-01`, `${year}-${m}-${String(daysInMonth(year, month)).padStart(2, "0")}`];
}

/** Days of [a1,a2] that fall inside [b1,b2]. */
export function overlapDays(a1: string, a2: string, b1: string, b2: string): number {
  const s = a1 > b1 ? a1 : b1;
  const e = a2 < b2 ? a2 : b2;
  return s > e ? 0 : calendarDays(s, e);
}

export function addDaysIso(iso: string, n: number): string {
  return fromUtc(toUtc(iso) + n * DAY);
}

/**
 * Whole months of service from hire date to asOf. A month counts once the same day-of-month is
 * reached; if that day doesn't exist in asOf's month (hired on the 31st, or 29 Feb), the month's
 * last day counts.
 */
export function completeMonths(hire: string, asOf: string): number {
  if (asOf < hire) return 0;
  const [hy, hm, hd] = [+hire.slice(0, 4), +hire.slice(5, 7), +hire.slice(8, 10)];
  const [ay, am, ad] = [+asOf.slice(0, 4), +asOf.slice(5, 7), +asOf.slice(8, 10)];
  let months = (ay - hy) * 12 + (am - hm);
  if (ad < hd && ad < daysInMonth(ay, am)) months -= 1;
  return Math.max(0, months);
}

/** The same calendar date `years` later (29 Feb → 28 Feb in non-leap years). */
function addYearsIso(iso: string, years: number): string {
  const y = +iso.slice(0, 4) + years;
  const m = +iso.slice(5, 7);
  const d = Math.min(+iso.slice(8, 10), daysInMonth(y, m));
  return `${y}-${iso.slice(5, 7)}-${String(d).padStart(2, "0")}`;
}

/**
 * Service in years from hire date through the last working day (inclusive): whole years by
 * calendar anniversary, plus the elapsed fraction of the current service year.
 * 2021-01-01 → 2023-12-31 is exactly 3 years.
 */
export function serviceYears(hire: string, lastDay: string): number {
  if (lastDay < hire) return 0;
  const end = addDaysIso(lastDay, 1); // service runs through the end of the last day
  let years = 0;
  while (addYearsIso(hire, years + 1) <= end) years += 1;
  const from = addYearsIso(hire, years);
  const to = addYearsIso(hire, years + 1);
  return years + (toUtc(end) - toUtc(from)) / (toUtc(to) - toUtc(from));
}

// ── Pay ────────────────────────────────────────────────────────────────────

type SalaryParts = {
  basicSalaryFils: number;
  housingAllowanceFils: number;
  transportAllowanceFils: number;
  otherAllowanceFils: number;
};

/** Monthly wage as defined for indemnity and leave pay: basic plus regular allowances. */
export function monthlyWage(e: SalaryParts): number {
  return e.basicSalaryFils + e.housingAllowanceFils + e.transportAllowanceFils + e.otherAllowanceFils;
}

export function dailyRate(monthlyFils: number, s: HrSettings): number {
  return monthlyFils / s.dailyRateDivisor;
}

export function hourlyRate(monthlyFils: number, s: HrSettings): number {
  return monthlyFils / s.dailyRateDivisor / s.hoursPerDay;
}

/**
 * PIFSS contributions on a monthly insured salary.
 * Basic band: up to basicCap. Supplementary band: the part between basicCap and totalCap.
 * Pension-increase and unemployment: up to totalCap. Financial remuneration (employee only): up to remunerationCap.
 */
export function pifss(salaryFils: number, s: HrSettings): { employee: number; employer: number } {
  const p = s.pifss;
  const basicBand = Math.min(salaryFils, p.basicCapFils);
  const suppBand = Math.max(0, Math.min(salaryFils, p.totalCapFils) - p.basicCapFils);
  const capped = Math.min(salaryFils, p.totalCapFils);
  const remBand = Math.min(salaryFils, p.remunerationCapFils);
  const pct = (amount: number, rate: number) => (amount * rate) / 100;
  const employee =
    pct(basicBand, p.employee.basic) +
    pct(suppBand, p.employee.supplementary) +
    pct(capped, p.employee.pensionIncrease) +
    pct(capped, p.employee.unemployment) +
    pct(remBand, p.employee.remuneration);
  const employer =
    pct(basicBand, p.employer.basic) + pct(suppBand, p.employer.supplementary) + pct(capped, p.employer.pensionIncrease) + pct(capped, p.employer.unemployment);
  return { employee: Math.round(employee), employer: Math.round(employer) };
}

// ── End-of-service indemnity (Kuwait Labour Law 6/2010, Arts. 51–53) ───────

/** Share of the full indemnity payable on resignation, by completed years of service. */
export function resignationShare(years: number): number {
  if (years < 3) return 0;
  if (years < 5) return 1 / 2;
  if (years < 10) return 2 / 3;
  return 1;
}

/**
 * Full indemnity for a monthly-paid worker: 15 days' wage per year for the first 5 years,
 * one month's wage per year after that, pro rata for part years, capped at 18 months' wage.
 * On resignation from an open-ended contract only a share is due (see resignationShare).
 */
export function indemnity(
  wageFils: number,
  hire: string,
  end: string,
  reason: SeparationReason | null,
  contract: "unlimited" | "fixed",
  s: HrSettings,
): { years: number; fullFils: number; share: number; payableFils: number } {
  const years = serviceYears(hire, end);
  const daily = dailyRate(wageFils, s);
  const first = Math.min(years, 5) * 15 * daily;
  const after = Math.max(0, years - 5) * wageFils;
  const fullFils = Math.round(Math.min(first + after, 18 * wageFils));
  const share = reason === "resignation" && contract === "unlimited" ? resignationShare(years) : 1;
  return { years, fullFils, share, payableFils: Math.round(fullFils * share) };
}

// ── Leave ──────────────────────────────────────────────────────────────────

/**
 * Splits `days` of leave across the type's pay bands, given how many days of the same
 * type were already used in the current period. Days beyond the last band are unpaid.
 */
export function applyPayTiers(tiers: PayTier[], alreadyUsed: number, days: number): { breakdown: { days: number; pct: number }[]; unpaidCentiDays: number } {
  const breakdown: { days: number; pct: number }[] = [];
  let skip = alreadyUsed;
  let left = days;
  for (const tier of tiers) {
    if (left <= 0) break;
    let room = tier.days === null ? Infinity : tier.days;
    const consumed = Math.min(skip, room);
    skip -= consumed;
    room -= consumed;
    const take = Math.min(left, room);
    if (take > 0) {
      breakdown.push({ days: take, pct: tier.pct });
      left -= take;
    }
  }
  if (left > 0) breakdown.push({ days: left, pct: 0 });
  for (let k = breakdown.length - 1; k > 0; k--) {
    if (breakdown[k].pct === breakdown[k - 1].pct) {
      breakdown[k - 1].days += breakdown[k].days;
      breakdown.splice(k, 1);
    }
  }
  const unpaidCentiDays = Math.round(breakdown.reduce((a, b) => a + b.days * (100 - b.pct), 0));
  return { breakdown, unpaidCentiDays };
}

/** Annual leave earned to date: allowance/12 per complete month of service, plus any opening balance. */
export function annualLeaveEarned(allowanceDays: number, hire: string, asOf: string, openingDays: number): number {
  return Math.round(((completeMonths(hire, asOf) * allowanceDays) / 12 + openingDays) * 10) / 10;
}

// ── Payslip ────────────────────────────────────────────────────────────────

export type PayslipInput = SalaryParts & {
  isKuwaiti: boolean;
  pifssSalaryFils: number | null;
  daysEmployed: number;
  daysInMonth: number;
  overtimeNormalCentiHours: number;
  overtimeRestCentiHours: number;
  overtimeHolidayCentiHours: number;
  bonusFils: number;
  unpaidLeaveCentiDays: number;
  absenceDays: number;
  otherDeductionFils: number;
};

export type PayslipAmounts = {
  basicFils: number;
  housingFils: number;
  transportFils: number;
  otherAllowanceFils: number;
  overtimeFils: number;
  unpaidLeaveFils: number;
  absenceFils: number;
  pifssEmployeeFils: number;
  pifssEmployerFils: number;
  grossFils: number;
  deductionsFils: number;
  netFils: number;
};

export function computePayslip(i: PayslipInput, s: HrSettings): PayslipAmounts {
  const f = i.daysInMonth > 0 ? i.daysEmployed / i.daysInMonth : 0;
  const pro = (fils: number) => Math.round(fils * f);
  const basicFils = pro(i.basicSalaryFils);
  const housingFils = pro(i.housingAllowanceFils);
  const transportFils = pro(i.transportAllowanceFils);
  const otherAllowanceFils = pro(i.otherAllowanceFils);

  const wage = monthlyWage(i);
  const hourly = hourlyRate(wage, s);
  const daily = dailyRate(wage, s);
  const overtimeFils = Math.round(
    (hourly *
      (i.overtimeNormalCentiHours * s.overtimeNormalPct +
        i.overtimeRestCentiHours * s.overtimeRestDayPct +
        i.overtimeHolidayCentiHours * s.overtimeHolidayPct)) /
      10_000,
  );
  // Day-based deductions can never take away more than the fixed pay earned this month
  // (e.g. a whole month of unpaid leave at wage/26 would otherwise exceed the salary).
  const fixedPay = basicFils + housingFils + transportFils + otherAllowanceFils;
  const unpaidLeaveFils = Math.min(Math.round((daily * i.unpaidLeaveCentiDays) / 100), fixedPay);
  const absenceFils = Math.min(Math.round(daily * i.absenceDays), fixedPay - unpaidLeaveFils);

  const insured = i.pifssSalaryFils ?? wage;
  const contributions = i.isKuwaiti ? pifss(insured, s) : { employee: 0, employer: 0 };
  const pifssEmployeeFils = Math.round(contributions.employee * f);
  const pifssEmployerFils = Math.round(contributions.employer * f);

  const grossFils = basicFils + housingFils + transportFils + otherAllowanceFils + overtimeFils + i.bonusFils;
  const deductionsFils = unpaidLeaveFils + absenceFils + pifssEmployeeFils + i.otherDeductionFils;
  return {
    basicFils,
    housingFils,
    transportFils,
    otherAllowanceFils,
    overtimeFils,
    unpaidLeaveFils,
    absenceFils,
    pifssEmployeeFils,
    pifssEmployerFils,
    grossFils,
    deductionsFils,
    netFils: grossFils - deductionsFils,
  };
}
