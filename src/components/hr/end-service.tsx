"use client";

import { useState } from "react";
import { endService } from "@/lib/actions/hr";
import { ActionForm, Field, SubmitButton } from "@/components/forms";

export function EndServiceForm({
  lang,
  id,
  today,
  labels,
}: {
  lang: string;
  id: string;
  today: string;
  labels: { record: string; endDate: string; reason: string; reasons: Record<string, string>; confirm: string; cancel: string; saving: string };
}) {
  const [open, setOpen] = useState(false);
  if (!open) {
    return (
      <button type="button" className="btn-danger w-full" onClick={() => setOpen(true)}>
        {labels.record}
      </button>
    );
  }
  return (
    <ActionForm action={endService} hidden={{ lang, id }} onSuccess={() => setOpen(false)} className="space-y-3 rounded-xl border border-red-200 bg-red-50/60 p-4">
      <Field label={labels.endDate} name="endDate" type="date" required defaultValue={today} autoFocus />
      <div>
        <label htmlFor="f-reason" className="label">
          {labels.reason}
        </label>
        <select id="f-reason" name="reason" className="input" defaultValue="resignation">
          {Object.entries(labels.reasons).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-wrap gap-2">
        <SubmitButton className="btn border border-red-700 bg-red-600 text-white hover:bg-red-700" pendingLabel={labels.saving}>
          {labels.confirm}
        </SubmitButton>
        <button type="button" className="btn-secondary" onClick={() => setOpen(false)}>
          {labels.cancel}
        </button>
      </div>
    </ActionForm>
  );
}
