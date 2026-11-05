/**
 * Accrual calculations for recurring contracts (rent) and expenses paid for a period
 * (insurance, licences). Pure functions: amounts are fils (may be fractional until the caller
 * rounds), dates are "YYYY-MM-DD" strings, ranges are inclusive.
 */
import { addDaysIso, daysInMonth, overlapDays } from "@/lib/hr";

export type RateSegment = { from: string; to: string | null; monthly: number };

const pad = (n: number) => String(n).padStart(2, "0");
const monthStart = (key: string) => `${key}-01`;
const monthEnd = (key: string) => `${key}-${pad(daysInMonth(+key.slice(0, 4), +key.slice(5, 7)))}`;
const FAR = "9999-12-31";

/** Every "YYYY-MM" from one date to another, inclusive. */
export function monthKeys(from: string, to: string): string[] {
  const out: string[] = [];
  let y = +from.slice(0, 4);
  let m = +from.slice(5, 7);
  const last = to.slice(0, 7);
  while (`${y}-${pad(m)}` <= last) {
    out.push(`${y}-${pad(m)}`);
    if (++m > 12) {
      m = 1;
      y += 1;
    }
  }
  return out;
}

/**
 * The monthly amount in force over each stretch of a contract. A rate applies from its date
 * until the day before the next one; anything before the contract start or after its end is cut.
 */
export function rateSegments(rates: { effectiveFrom: string; monthlyFils: number }[], start: string, end: string | null): RateSegment[] {
  const sorted = [...rates].sort((a, b) => (a.effectiveFrom < b.effectiveFrom ? -1 : 1));
  const out: RateSegment[] = [];
  sorted.forEach((r, i) => {
    const next = sorted[i + 1];
    // The earliest rate also covers any days between the contract start and its own date.
    const from = i === 0 || r.effectiveFrom < start ? start : r.effectiveFrom;
    let to: string | null = next ? addDaysIso(next.effectiveFrom, -1) : null;
    if (end && (!to || to > end)) to = end;
    if (to && to < from) return;
    out.push({ from, to, monthly: r.monthlyFils });
  });
  return out;
}

/**
 * The cost a contract adds to each month within [from, to]. Each month carries its monthly
 * amount in full; a month the contract only partly covers (or a rate change mid-month, or a
 * range covering part of a month) carries the share of its days.
 */
export function accrueByMonth(segments: RateSegment[], from: string, to: string): Map<string, number> {
  const out = new Map<string, number>();
  for (const s of segments) {
    const a = s.from > from ? s.from : from;
    const b = (s.to ?? FAR) < to ? s.to! : to;
    if (a > b) continue;
    for (const key of monthKeys(a, b)) {
      const dim = daysInMonth(+key.slice(0, 4), +key.slice(5, 7));
      const days = overlapDays(monthStart(key), monthEnd(key), a, b);
      out.set(key, (out.get(key) ?? 0) + (s.monthly * days) / dim);
    }
  }
  return out;
}

/**
 * Spreads an amount paid for [periodFrom, periodTo] evenly by day, giving each month's share within
 * [from, to]. Whole months get whole fils that add up exactly to the amount (largest remainder);
 * a month the range only partly covers gets its days' share of that month's fils.
 */
export function spreadByMonth(amount: number, periodFrom: string, periodTo: string, from: string, to: string): Map<string, number> {
  const out = new Map<string, number>();
  const total = overlapDays(periodFrom, periodTo, periodFrom, periodTo);
  if (total <= 0) return out;
  const keys = monthKeys(periodFrom, periodTo);
  const days = keys.map((k) => overlapDays(monthStart(k), monthEnd(k), periodFrom, periodTo));
  const exact = days.map((d) => (amount * d) / total);
  const fils = exact.map(Math.floor);
  let left = Math.round(amount) - fils.reduce((x, y) => x + y, 0);
  [...exact.keys()].sort((i, j) => exact[j] - fils[j] - (exact[i] - fils[i])).forEach((i) => {
    if (left > 0) {
      fils[i] += 1;
      left -= 1;
    }
  });
  keys.forEach((key, i) => {
    const inRange = overlapDays(monthStart(key), monthEnd(key), periodFrom > from ? periodFrom : from, periodTo < to ? periodTo : to);
    if (inRange > 0) out.set(key, inRange === days[i] ? fils[i] : (fils[i] * inRange) / days[i]);
  });
  return out;
}

/** The date a month's payment falls due: its due day (clamped to the month), never before the contract starts or after it ends. */
export function dueDate(key: string, dueDay: number, start: string, end: string | null = null): string {
  const dim = daysInMonth(+key.slice(0, 4), +key.slice(5, 7));
  const d = `${key}-${pad(Math.min(Math.max(dueDay, 1), dim))}`;
  if (d < start) return start;
  return end && d > end ? end : d;
}

export type ScheduleRow = { key: string; due: string; amount: number };

/** One row per contract month from the start up to `until` (or the end date): the month's cost and when it's due. */
export function schedule(segments: RateSegment[], start: string, end: string | null, dueDay: number, until: string): ScheduleRow[] {
  const last = end && end < until ? end : until;
  if (last < start) return [];
  // Segments already stop at the end date, so whole months can be asked for.
  const byMonth = accrueByMonth(segments, start, monthEnd(last.slice(0, 7)));
  return monthKeys(start, last).map((key) => ({ key, due: dueDate(key, dueDay, start, end), amount: byMonth.get(key) ?? 0 }));
}

/** Total that has fallen due on or before `asOf`. */
export function dueSoFar(segments: RateSegment[], start: string, end: string | null, dueDay: number, asOf: string): number {
  return schedule(segments, start, end, dueDay, asOf)
    .filter((r) => r.due <= asOf)
    .reduce((a, r) => a + r.amount, 0);
}

/** The part of a period payment not yet used up at the end of `asOf` (a prepaid expense). Zero if paid after `asOf`. */
export function prepaidPortion(amount: number, paidOn: string, periodFrom: string, periodTo: string, asOf: string): number {
  if (paidOn > asOf || periodTo <= asOf) return 0;
  const total = overlapDays(periodFrom, periodTo, periodFrom, periodTo);
  const remaining = overlapDays(periodFrom, periodTo, addDaysIso(asOf, 1), periodTo);
  return total > 0 ? (amount * remaining) / total : 0;
}
