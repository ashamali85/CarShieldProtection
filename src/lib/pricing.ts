/**
 * Job pricing and quality-check rules shared by pages and actions. Pure module.
 * Money is integer fils; percentages are basis points (1,000 = 10.00%).
 */

export type DiscountInput = { discountFils: number; discountPercentBp: number | null };

/** The discount in fils for a subtotal: a percentage of it, or a fixed amount capped at the subtotal. */
export function jobDiscount(d: DiscountInput, subtotalFils: number): number {
  if (d.discountPercentBp != null) return Math.round((subtotalFils * d.discountPercentBp) / 10000);
  return Math.min(d.discountFils, subtotalFils);
}

export function subtotalOf(items: { priceFils: number; quantity: number }[]): number {
  return items.reduce((a, i) => a + i.priceFils * i.quantity, 0);
}

/** "12.5" → 1250 basis points; accepts Arabic digits and a comma; 0–100 with up to 2 decimals. */
export function parsePercent(input: string): number | null {
  const s = input.trim().replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d))).replace(",", ".").replace("%", "");
  if (s === "") return 0;
  if (!/^\d+(\.\d{0,2})?$/.test(s)) return null;
  const bp = Math.round(Number(s) * 100);
  return bp <= 10000 ? bp : null;
}

/** "10.00%" style text without trailing zeros: 1000 → "10", 1250 → "12.5". */
export function percentText(bp: number): string {
  return String(Number((bp / 100).toFixed(2)));
}

/** The quality-check list. Every item must be ticked before a job can be marked complete. */
export const QC_CHECKS = ["finish", "edges", "damage", "clean", "belongings"] as const;
export type QcCheck = (typeof QC_CHECKS)[number];

export function qcComplete(checks: string[]): boolean {
  return QC_CHECKS.every((c) => checks.includes(c));
}
