"use client";

import { useState } from "react";
import type { HrSettings } from "@/db/schema";
import { saveHrSettings, saveLeaveType } from "@/lib/actions/hr";
import { ActionForm, Field, SubmitButton } from "@/components/forms";

type SettingsText = {
  saved: string;
  save: string;
  saving: string;
  payRules: string;
  dailyDivisor: string;
  dailyDivisorHint: string;
  hoursPerDay: string;
  otNormal: string;
  otRest: string;
  otHoliday: string;
  pifssTitle: string;
  pifssHint: string;
  basicCap: string;
  totalCap: string;
  remunerationCap: string;
  employeeRates: string;
  employerRates: string;
  components: { basic: string; supplementary: string; pensionIncrease: string; unemployment: string; remuneration: string };
};

function useSaved() {
  const [saved, setSaved] = useState(false);
  return [saved, () => { setSaved(true); window.setTimeout(() => setSaved(false), 2500); }] as const;
}

export function PayRulesForm({ lang, s, text }: { lang: string; s: HrSettings; text: SettingsText }) {
  const [saved, flash] = useSaved();
  const kwd = (f: number) => (f / 1000).toFixed(3);
  const comps = ["basic", "supplementary", "pensionIncrease", "unemployment", "remuneration"] as const;
  return (
    <ActionForm action={saveHrSettings} hidden={{ lang }} resetOnSuccess={false} onSuccess={flash} className="space-y-6">
      <section className="card card-pad">
        <h2 className="section-title mb-4">{text.payRules}</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={text.dailyDivisor} name="dailyRateDivisor" type="number" min={1} step="any" dir="ltr" defaultValue={s.dailyRateDivisor} hint={text.dailyDivisorHint} />
          <Field label={text.hoursPerDay} name="hoursPerDay" type="number" min={1} step="any" dir="ltr" defaultValue={s.hoursPerDay} />
          <Field label={text.otNormal} name="overtimeNormalPct" type="number" min={0} step="any" dir="ltr" defaultValue={s.overtimeNormalPct} />
          <Field label={text.otRest} name="overtimeRestDayPct" type="number" min={0} step="any" dir="ltr" defaultValue={s.overtimeRestDayPct} />
          <Field label={text.otHoliday} name="overtimeHolidayPct" type="number" min={0} step="any" dir="ltr" defaultValue={s.overtimeHolidayPct} />
        </div>
      </section>
      <section className="card card-pad">
        <h2 className="section-title">{text.pifssTitle}</h2>
        <p className="hint mb-4">{text.pifssHint}</p>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label={text.basicCap} name="basicCap" inputMode="decimal" dir="ltr" defaultValue={kwd(s.pifss.basicCapFils)} />
          <Field label={text.totalCap} name="totalCap" inputMode="decimal" dir="ltr" defaultValue={kwd(s.pifss.totalCapFils)} />
          <Field label={text.remunerationCap} name="remunerationCap" inputMode="decimal" dir="ltr" defaultValue={kwd(s.pifss.remunerationCapFils)} />
        </div>
        <div className="table-wrap mt-5">
          <table className="table">
            <thead>
              <tr>
                <th />
                <th className="text-end">{text.employeeRates}</th>
                <th className="text-end">{text.employerRates}</th>
              </tr>
            </thead>
            <tbody>
              {comps.map((c) => (
                <tr key={c}>
                  <td>{text.components[c]}</td>
                  <td className="text-end">
                    <label className="sr-only" htmlFor={`ee_${c}`}>{`${text.components[c]} – ${text.employeeRates}`}</label>
                    <input id={`ee_${c}`} name={`ee_${c}`} type="number" min={0} max={100} step="any" dir="ltr" defaultValue={s.pifss.employee[c]} className="input ms-auto w-24 text-end" />
                  </td>
                  <td className="text-end">
                    {c === "remuneration" ? (
                      <span className="text-muted">—</span>
                    ) : (
                      <>
                        <label className="sr-only" htmlFor={`er_${c}`}>{`${text.components[c]} – ${text.employerRates}`}</label>
                        <input id={`er_${c}`} name={`er_${c}`} type="number" min={0} max={100} step="any" dir="ltr" defaultValue={s.pifss.employer[c]} className="input ms-auto w-24 text-end" />
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <div className="flex items-center gap-3">
        <SubmitButton pendingLabel={text.saving}>{text.save}</SubmitButton>
        <p role="status" className="text-sm text-emerald-700">
          {saved ? text.saved : ""}
        </p>
      </div>
    </ActionForm>
  );
}

type TypeText = {
  nameEn: string;
  nameAr: string;
  allowanceDays: string;
  payPct: string;
  payBands: string;
  minService: string;
  femaleOnly: string;
  active: string;
  period: string;
  periods: Record<"year" | "service" | "accrual" | "event", string>;
  save: string;
  saving: string;
  saved: string;
  edit: string;
  cancel: string;
  noLimit: string;
  addType: string;
};

export type LeaveTypeRow = {
  id: string;
  nameEn: string;
  nameAr: string;
  allowanceDays: number | null;
  period: "year" | "service" | "accrual" | "event";
  bands: string;
  singlePct: number | null;
  minServiceMonths: number;
  femaleOnly: boolean;
  active: boolean;
};

function TypeFields({ row, text }: { row?: LeaveTypeRow; text: TypeText }) {
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <Field label={text.nameEn} name="nameEn" required dir="ltr" defaultValue={row?.nameEn} />
      <Field label={text.nameAr} name="nameAr" required dir="rtl" lang="ar" defaultValue={row?.nameAr} />
      <div>
        <label htmlFor={`period-${row?.id ?? "new"}`} className="label">
          {text.period}
        </label>
        <select id={`period-${row?.id ?? "new"}`} name="period" defaultValue={row?.period ?? "year"} className="input">
          {Object.entries(text.periods).map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
      </div>
      <Field label={text.allowanceDays} name="allowanceDays" type="number" min={0} dir="ltr" defaultValue={row?.allowanceDays ?? ""} placeholder={text.noLimit} />
      {row && row.singlePct === null ? (
        <div>
          <span className="label">{text.payBands}</span>
          <p className="num py-2 text-sm text-muted">{row.bands}</p>
        </div>
      ) : (
        <Field label={text.payPct} name="payPct" type="number" min={0} max={100} dir="ltr" defaultValue={row?.singlePct ?? 100} />
      )}
      <Field label={text.minService} name="minServiceMonths" type="number" min={0} dir="ltr" defaultValue={row?.minServiceMonths ?? 0} />
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="femaleOnly" defaultChecked={row?.femaleOnly} className="size-4 accent-brand-600" />
        {text.femaleOnly}
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="active" defaultChecked={row?.active ?? true} className="size-4 accent-brand-600" />
        {text.active}
      </label>
    </div>
  );
}

export function LeaveTypeItem({ lang, row, title, summary, text }: { lang: string; row: LeaveTypeRow; title: string; summary: string; text: TypeText }) {
  const [open, setOpen] = useState(false);
  return (
    <li className={`border-b border-line px-4 py-3 last:border-b-0 sm:px-6 ${row.active ? "" : "text-muted"}`}>
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="font-medium">{title}</p>
          <p className="text-xs text-muted">{summary}</p>
        </div>
        {!open && (
          <button type="button" className="btn-ghost min-h-8 px-2 text-xs" onClick={() => setOpen(true)}>
            {text.edit}
          </button>
        )}
      </div>
      {open && (
        <ActionForm action={saveLeaveType} hidden={{ lang, id: row.id }} resetOnSuccess={false} onSuccess={() => setOpen(false)} className="mt-3 space-y-3">
          <TypeFields row={row} text={text} />
          <div className="flex gap-2">
            <SubmitButton pendingLabel={text.saving}>{text.save}</SubmitButton>
            <button type="button" className="btn-secondary" onClick={() => setOpen(false)}>
              {text.cancel}
            </button>
          </div>
        </ActionForm>
      )}
    </li>
  );
}

export function AddLeaveType({ lang, text }: { lang: string; text: TypeText }) {
  const [open, setOpen] = useState(false);
  if (!open) {
    return (
      <button type="button" className="btn-secondary" onClick={() => setOpen(true)}>
        {text.addType}
      </button>
    );
  }
  return (
    <ActionForm action={saveLeaveType} hidden={{ lang }} onSuccess={() => setOpen(false)} className="card card-pad space-y-3">
      <TypeFields text={text} />
      <div className="flex gap-2">
        <SubmitButton pendingLabel={text.saving}>{text.addType}</SubmitButton>
        <button type="button" className="btn-secondary" onClick={() => setOpen(false)}>
          {text.cancel}
        </button>
      </div>
    </ActionForm>
  );
}
