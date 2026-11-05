import { addDaysIso, daysInMonth } from "@/lib/hr";

export type PeriodKind = "month" | "quarter" | "year" | "custom";
export type Period = { kind: PeriodKind; from: string; to: string; year: number; month: number; quarter: number };

const pad = (n: number) => String(n).padStart(2, "0");
const iso = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Reads ?p=month|quarter|year|custom&y=&m=&q=&from=&to= into a date range, defaulting to the current month. */
export function parsePeriod(sp: Record<string, string | string[] | undefined>, today: string, fallback: PeriodKind = "month"): Period {
  const one = (k: string) => {
    const v = sp[k];
    return (Array.isArray(v) ? v[0] : v) ?? "";
  };
  const kind = (["month", "quarter", "year", "custom"] as const).find((k) => k === one("p")) ?? fallback;
  const y = Number(one("y")) || +today.slice(0, 4);
  const m = Math.min(12, Math.max(1, Number(one("m")) || +today.slice(5, 7)));
  const q = Math.min(4, Math.max(1, Number(one("q")) || Math.ceil(+today.slice(5, 7) / 3)));
  if (kind === "year") return { kind, from: iso(y, 1, 1), to: iso(y, 12, 31), year: y, month: m, quarter: q };
  if (kind === "quarter") {
    const sm = (q - 1) * 3 + 1;
    return { kind, from: iso(y, sm, 1), to: iso(y, sm + 2, daysInMonth(y, sm + 2)), year: y, month: m, quarter: q };
  }
  if (kind === "custom") {
    let from = one("from");
    let to = one("to");
    if (!DATE.test(from)) from = iso(y, m, 1);
    if (!DATE.test(to)) to = today;
    if (to < from) [from, to] = [to, from];
    return { kind, from, to, year: +from.slice(0, 4), month: +from.slice(5, 7), quarter: q };
  }
  return { kind: "month", from: iso(y, m, 1), to: iso(y, m, daysInMonth(y, m)), year: y, month: m, quarter: q };
}

/** The period of the same kind and length just before this one. */
export function previousPeriod(p: Period): { from: string; to: string } {
  if (p.kind === "month") {
    const y = p.month === 1 ? p.year - 1 : p.year;
    const m = p.month === 1 ? 12 : p.month - 1;
    return { from: iso(y, m, 1), to: iso(y, m, daysInMonth(y, m)) };
  }
  if (p.kind === "quarter") {
    const y = p.quarter === 1 ? p.year - 1 : p.year;
    const q = p.quarter === 1 ? 4 : p.quarter - 1;
    const sm = (q - 1) * 3 + 1;
    return { from: iso(y, sm, 1), to: iso(y, sm + 2, daysInMonth(y, sm + 2)) };
  }
  if (p.kind === "year") return { from: iso(p.year - 1, 1, 1), to: iso(p.year - 1, 12, 31) };
  const len = Math.round((Date.parse(p.to) - Date.parse(p.from)) / 86_400_000) + 1;
  const to = addDaysIso(p.from, -1);
  return { from: addDaysIso(to, -(len - 1)), to };
}

/** Query string for a period (used in links between finance pages). */
export function periodQuery(p: Period): string {
  if (p.kind === "custom") return `?p=custom&from=${p.from}&to=${p.to}`;
  if (p.kind === "year") return `?p=year&y=${p.year}`;
  if (p.kind === "quarter") return `?p=quarter&y=${p.year}&q=${p.quarter}`;
  return `?p=month&y=${p.year}&m=${p.month}`;
}
