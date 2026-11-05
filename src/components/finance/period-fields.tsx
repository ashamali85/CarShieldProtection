"use client";

import { useState } from "react";
import { Field } from "@/components/forms";

/** "Covers a period" checkbox that reveals the from/to dates for spreading a payment over months. */
export function PeriodFields({ from, to, labels }: { from?: string | null; to?: string | null; labels: { period: string; hint: string; from: string; to: string } }) {
  const [on, setOn] = useState(!!from);
  return (
    <div className="rounded-lg border border-line p-3">
      <label className="flex min-h-6 cursor-pointer items-center gap-2 text-sm font-medium text-ink">
        <input type="checkbox" name="hasPeriod" checked={on} onChange={(e) => setOn(e.target.checked)} className="size-4 accent-brand-600" />
        {labels.period}
      </label>
      <p className="hint mt-1">{labels.hint}</p>
      {on && (
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <Field label={labels.from} name="periodFrom" type="date" required defaultValue={from ?? ""} />
          <Field label={labels.to} name="periodTo" type="date" required defaultValue={to ?? ""} />
        </div>
      )}
    </div>
  );
}
