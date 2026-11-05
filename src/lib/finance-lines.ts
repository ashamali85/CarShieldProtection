import type { Dictionary, Locale } from "@/i18n";
import type { FinanceReport, MonthFigures } from "@/lib/finance";
import type { Line } from "@/components/finance/statement";

export const pct = (part: number, whole: number) => (whole ? `${((part / whole) * 100).toFixed(1)}%` : "—");

/** The P&L as statement lines, current vs previous. */
export function pnlLines(cur: MonthFigures, prev: MonthFigures, report: FinanceReport, t: Dictionary, lang: Locale): Line[] {
  const P = t.finance.pnl;
  const cats = ["ppf", "ceramic", "tint", "detailing", "other"] as const;
  const opexCodes = [...new Set([...Object.keys(cur.opexByCategory), ...Object.keys(prev.opexByCategory)])];
  const catName = (code: string) => {
    const c = report.categories.find((x) => x.code === code);
    return c ? (lang === "ar" ? c.nameAr : c.nameEn) : code;
  };
  const order = (code: string) => report.categories.findIndex((x) => x.code === code);
  const lines: Line[] = [
    { label: P.revenue, value: 0, kind: "section" },
    ...cats
      .filter((c) => cur.revenueByCategory[c] || prev.revenueByCategory[c])
      .map((c): Line => ({ label: t.services.categories[c], value: cur.revenueByCategory[c], previous: prev.revenueByCategory[c], level: 1 })),
    ...(cur.discounts || prev.discounts ? [{ label: P.discounts, value: cur.discounts, previous: prev.discounts, level: 1, negative: true, costLike: true } as Line] : []),
    { label: P.netRevenue, value: cur.netRevenue, previous: prev.netRevenue, kind: "total" },
    { label: P.cogs, value: 0, kind: "section" },
    { label: P.materials, value: cur.materials, previous: prev.materials, level: 1, negative: true, costLike: true },
    { label: `${P.grossProfit} · ${pct(cur.grossProfit, cur.netRevenue)}`, value: cur.grossProfit, previous: prev.grossProfit, kind: "total" },
    { label: P.opex, value: 0, kind: "section" },
    { label: P.payroll, value: cur.payrollFixed, previous: prev.payrollFixed, level: 1, negative: true, costLike: true },
    ...(cur.payrollExtra || prev.payrollExtra ? [{ label: P.overtime, value: cur.payrollExtra, previous: prev.payrollExtra, level: 1, negative: true, costLike: true } as Line] : []),
    ...(cur.employerPifss || prev.employerPifss ? [{ label: P.employerPifss, value: cur.employerPifss, previous: prev.employerPifss, level: 1, negative: true, costLike: true } as Line] : []),
    ...opexCodes
      .sort((a, b) => order(a) - order(b))
      .map((code): Line => ({ label: catName(code), value: cur.opexByCategory[code] ?? 0, previous: prev.opexByCategory[code] ?? 0, level: 1, negative: true, costLike: true })),
    ...(cur.stockLoss || prev.stockLoss ? [{ label: P.stockLoss, value: cur.stockLoss, previous: prev.stockLoss, level: 1, negative: true, costLike: true } as Line] : []),
    { label: P.totalOpex, value: cur.totalOpex, previous: prev.totalOpex, kind: "total", negative: true, costLike: true },
    { label: P.operatingProfit, value: cur.operatingProfit, previous: prev.operatingProfit, kind: "total" },
    ...(cur.otherIncome || prev.otherIncome ? [{ label: P.otherIncome, value: cur.otherIncome, previous: prev.otherIncome, level: 1 } as Line] : []),
    { label: `${cur.netProfit < 0 ? P.netLoss : P.netProfit} · ${pct(cur.netProfit, cur.netRevenue)}`, value: cur.netProfit, previous: prev.netProfit, kind: "grand" },
  ];
  return lines;
}

