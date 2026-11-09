import type { Dictionary } from "@/i18n";
import { percentText } from "@/lib/pricing";

/** Discount as an amount in KWD or a percentage, chosen from the box beside the number. */
export function DiscountField({ t, fils, percentBp, optional }: { t: Dictionary; fils?: number; percentBp?: number | null; optional?: boolean }) {
  const J = t.jobs;
  const isPercent = percentBp != null;
  const value = isPercent ? percentText(percentBp) : fils ? (fils / 1000).toFixed(3) : "";
  return (
    <div>
      <label htmlFor="f-discount" className="label">
        {J.discount} {optional && <span className="font-normal text-muted">({t.common.optional})</span>}
      </label>
      <div className="flex gap-2">
        <input id="f-discount" name="discount" inputMode="decimal" dir="ltr" defaultValue={value} placeholder="0" className="input min-w-0 flex-1" />
        <label htmlFor="f-discountType" className="sr-only">
          {J.discountType}
        </label>
        <select id="f-discountType" name="discountType" defaultValue={isPercent ? "percent" : "amount"} className="input w-24 shrink-0">
          <option value="amount">{J.discountAmount}</option>
          <option value="percent">{J.discountPercent}</option>
        </select>
      </div>
    </div>
  );
}
