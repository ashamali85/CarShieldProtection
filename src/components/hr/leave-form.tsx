"use client";

import { useState } from "react";
import { recordLeave } from "@/lib/actions/hr";
import { ActionForm, SubmitButton } from "@/components/forms";

type Labels = {
  employee: string;
  chooseEmployee: string;
  type: string;
  start: string;
  end: string;
  days: string;
  daysHint: string;
  reason: string;
  saveAs: string;
  approved: string;
  pending: string;
  save: string;
  saving: string;
  cancel: string;
  optional: string;
};

const dayCount = (a: string, b: string) => {
  if (!a || !b || b < a) return "";
  return String(Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000) + 1);
};

export function LeaveForm({
  lang,
  employees,
  types,
  initialEmployee,
  back,
  labels,
}: {
  lang: string;
  employees: { id: string; name: string; gender: "male" | "female" }[];
  types: { id: string; name: string; femaleOnly: boolean }[];
  initialEmployee: string;
  back: string;
  labels: Labels;
}) {
  const [employeeId, setEmployeeId] = useState(initialEmployee);
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [days, setDays] = useState("");
  const [daysTouched, setDaysTouched] = useState(false);
  const gender = employees.find((e) => e.id === employeeId)?.gender;
  const visibleTypes = types.filter((t) => !t.femaleOnly || gender !== "male");

  const update = (s: string, e: string) => {
    if (!daysTouched) setDays(dayCount(s, e));
  };

  return (
    <ActionForm action={recordLeave} hidden={{ lang, back }} className="space-y-4">
      <div>
        <label htmlFor="f-employeeId" className="label">
          {labels.employee}
        </label>
        <select id="f-employeeId" name="employeeId" required className="input" value={employeeId} onChange={(e) => setEmployeeId(e.target.value)}>
          <option value="">{labels.chooseEmployee}</option>
          {employees.map((e) => (
            <option key={e.id} value={e.id}>
              {e.name}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor="f-leaveTypeId" className="label">
          {labels.type}
        </label>
        <select id="f-leaveTypeId" name="leaveTypeId" required className="input">
          {visibleTypes.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <label htmlFor="f-startDate" className="label">
            {labels.start}
          </label>
          <input
            id="f-startDate"
            name="startDate"
            type="date"
            required
            className="input"
            value={start}
            onChange={(e) => {
              setStart(e.target.value);
              const nextEnd = end && end >= e.target.value ? end : e.target.value;
              setEnd(nextEnd);
              update(e.target.value, nextEnd);
            }}
          />
        </div>
        <div>
          <label htmlFor="f-endDate" className="label">
            {labels.end}
          </label>
          <input
            id="f-endDate"
            name="endDate"
            type="date"
            required
            min={start || undefined}
            className="input"
            value={end}
            onChange={(e) => {
              setEnd(e.target.value);
              update(start, e.target.value);
            }}
          />
        </div>
        <div>
          <label htmlFor="f-days" className="label">
            {labels.days}
          </label>
          <input
            id="f-days"
            name="days"
            type="number"
            min={1}
            inputMode="numeric"
            className="input"
            value={days}
            onChange={(e) => {
              setDaysTouched(true);
              setDays(e.target.value);
            }}
          />
        </div>
      </div>
      <p className="hint -mt-2">{labels.daysHint}</p>
      <div>
        <label htmlFor="f-reason" className="label">
          {labels.reason} <span className="font-normal text-muted">({labels.optional})</span>
        </label>
        <textarea id="f-reason" name="reason" rows={2} className="input" />
      </div>
      <fieldset>
        <legend className="label">{labels.saveAs}</legend>
        <div className="flex flex-wrap gap-4">
          <label className="flex min-h-9 items-center gap-2 text-sm">
            <input type="radio" name="status" value="approved" defaultChecked className="size-4 accent-brand-600" />
            {labels.approved}
          </label>
          <label className="flex min-h-9 items-center gap-2 text-sm">
            <input type="radio" name="status" value="pending" className="size-4 accent-brand-600" />
            {labels.pending}
          </label>
        </div>
      </fieldset>
      <div className="flex gap-2">
        <SubmitButton pendingLabel={labels.saving}>{labels.save}</SubmitButton>
        <a href={back} className="btn-secondary">
          {labels.cancel}
        </a>
      </div>
    </ActionForm>
  );
}
