"use client";

import Link from "next/link";
import { useState } from "react";
import { adjustPayslip } from "@/lib/actions/hr";
import { ActionForm, Field, SubmitButton } from "@/components/forms";

type Labels = {
  adjust: string;
  payslip: string;
  overtimeNormal: string;
  overtimeRest: string;
  overtimeHoliday: string;
  bonus: string;
  absence: string;
  otherDeduction: string;
  note: string;
  save: string;
  saving: string;
  cancel: string;
  negativeNet: string;
  prorated: string;
};

export function PayslipRow({
  lang,
  href,
  editable,
  slip,
  cells,
  labels,
}: {
  lang: string;
  href: string;
  editable: boolean;
  slip: {
    id: string;
    name: string;
    daysEmployed: number;
    daysInMonth: number;
    otNormal: string;
    otRest: string;
    otHoliday: string;
    bonus: string;
    absence: string;
    otherDeduction: string;
    note: string;
    negative: boolean;
  };
  /** Pre-formatted money cells: earnings, extras, deductions, pifss, net. */
  cells: { earnings: string; extras: string; deductions: string; pifss: string; net: string };
  labels: Labels;
}) {
  const [open, setOpen] = useState(false);
  const partial = slip.daysEmployed < slip.daysInMonth;
  return (
    <>
      <tr className={open ? "bg-brand-50/50" : undefined}>
        <td>
          <span className="auto-dir block font-medium" dir="auto">
            {slip.name}
          </span>
          {partial && (
            <span className="block text-xs text-amber-800">
              {labels.prorated.replace("{d}", String(slip.daysEmployed)).replace("{m}", String(slip.daysInMonth))}
            </span>
          )}
          {slip.negative && <span className="block text-xs font-medium text-red-700">{labels.negativeNet}</span>}
        </td>
        <td className="num text-end">{cells.earnings}</td>
        <td className="num text-end">{cells.extras}</td>
        <td className="num text-end">{cells.deductions}</td>
        <td className="num text-end">{cells.pifss}</td>
        <td className="num text-end font-semibold">{cells.net}</td>
        <td>
          <span className="flex justify-end gap-1">
            {editable && (
              <button type="button" className="btn-ghost min-h-8 px-2 text-xs" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
                {labels.adjust}
              </button>
            )}
            <Link href={href} className="btn-ghost min-h-8 px-2 text-xs">
              {labels.payslip}
            </Link>
          </span>
        </td>
      </tr>
      {open && (
        <tr className="bg-brand-50/50">
          <td colSpan={7}>
            <ActionForm action={adjustPayslip} hidden={{ lang, id: slip.id }} resetOnSuccess={false} onSuccess={() => setOpen(false)} className="grid gap-3 py-1 sm:grid-cols-3">
              <Field label={labels.overtimeNormal} name="otNormal" inputMode="decimal" dir="ltr" defaultValue={slip.otNormal} />
              <Field label={labels.overtimeRest} name="otRest" inputMode="decimal" dir="ltr" defaultValue={slip.otRest} />
              <Field label={labels.overtimeHoliday} name="otHoliday" inputMode="decimal" dir="ltr" defaultValue={slip.otHoliday} />
              <Field label={labels.bonus} name="bonus" inputMode="decimal" dir="ltr" placeholder="0.000" defaultValue={slip.bonus} />
              <Field label={labels.absence} name="absence" inputMode="numeric" dir="ltr" defaultValue={slip.absence} />
              <Field label={labels.otherDeduction} name="otherDeduction" inputMode="decimal" dir="ltr" placeholder="0.000" defaultValue={slip.otherDeduction} />
              <div className="sm:col-span-3">
                <Field label={labels.note} name="note" defaultValue={slip.note} />
              </div>
              <div className="flex gap-2 sm:col-span-3">
                <SubmitButton pendingLabel={labels.saving}>{labels.save}</SubmitButton>
                <button type="button" className="btn-secondary" onClick={() => setOpen(false)}>
                  {labels.cancel}
                </button>
              </div>
            </ActionForm>
          </td>
        </tr>
      )}
    </>
  );
}
