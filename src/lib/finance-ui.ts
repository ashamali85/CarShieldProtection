import "server-only";
import { asc } from "drizzle-orm";
import { getDb, schema } from "@/db";
import type { Dictionary } from "@/i18n";
import type { Period } from "@/lib/period";

/** Years offered in the period picker: from the earliest invoice/expense year to next year. */
export async function pickerYears(db: Awaited<ReturnType<typeof getDb>>, current: number): Promise<number[]> {
  const [inv] = await db.select({ d: schema.invoices.issuedAt }).from(schema.invoices).orderBy(asc(schema.invoices.issuedAt)).limit(1);
  const first = Math.min(inv ? inv.d.getUTCFullYear() : current, current) - 1;
  const years: number[] = [];
  for (let y = current + 1; y >= first; y--) years.push(y);
  return years;
}

export function periodLabels(t: Dictionary) {
  const P = t.finance.period;
  return { label: P.label, month: P.month, quarter: P.quarter, year: P.year, custom: P.custom, from: P.from, to: P.to, apply: P.apply };
}

/** "October 2026", "Q4 2026", "2026" or "1 Oct 2026 – 15 Nov 2026". */
export function periodTitle(p: Period, lang: string) {
  const tag = lang === "ar" ? "ar-KW-u-nu-latn" : "en-GB";
  if (p.kind === "year") return String(p.year);
  if (p.kind === "quarter") return `Q${p.quarter} ${p.year}`;
  if (p.kind === "month") return new Intl.DateTimeFormat(tag, { month: "long", year: "numeric", timeZone: "UTC" }).format(Date.UTC(p.year, p.month - 1, 1));
  const f = (d: string) => new Intl.DateTimeFormat(tag, { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(Date.parse(d));
  return `${f(p.from)} – ${f(p.to)}`;
}
