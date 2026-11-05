"use client";

import { useState } from "react";
import { saveExpenseCategory, saveFinanceSettings } from "@/lib/actions/finance";
import { ActionForm, Field, SubmitButton } from "@/components/forms";

type Text = {
  openingCash: string;
  openingDate: string;
  saved: string;
  save: string;
  saving: string;
  cancel: string;
  edit: string;
  active: string;
  inactive: string;
  nameEn: string;
  nameAr: string;
  kind: string;
  addCategory: string;
  kinds: { operating: string; asset: string };
};

export function OpeningForm({ lang, cash, date, text }: { lang: string; cash: number; date: string; text: Text }) {
  const [saved, setSaved] = useState(false);
  return (
    <ActionForm
      action={saveFinanceSettings}
      hidden={{ lang }}
      resetOnSuccess={false}
      onSuccess={() => {
        setSaved(true);
        window.setTimeout(() => setSaved(false), 2500);
      }}
      className="space-y-4"
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={text.openingCash} name="openingCash" inputMode="decimal" dir="ltr" defaultValue={(cash / 1000).toFixed(3)} />
        <Field label={text.openingDate} name="openingDate" type="date" required defaultValue={date} />
      </div>
      <div className="flex items-center gap-3">
        <SubmitButton pendingLabel={text.saving}>{text.save}</SubmitButton>
        <p role="status" className="text-sm text-emerald-700">
          {saved ? text.saved : ""}
        </p>
      </div>
    </ActionForm>
  );
}

export type CategoryRow = { id: string; nameEn: string; nameAr: string; kind: "operating" | "asset"; active: boolean };

function CategoryFields({ row, text }: { row?: CategoryRow; text: Text }) {
  const id = row?.id ?? "new";
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <Field label={text.nameEn} name="nameEn" required dir="ltr" defaultValue={row?.nameEn} />
      <Field label={text.nameAr} name="nameAr" required dir="rtl" lang="ar" defaultValue={row?.nameAr} />
      <div>
        <label htmlFor={`kind-${id}`} className="label">
          {text.kind}
        </label>
        <select id={`kind-${id}`} name="kind" defaultValue={row?.kind ?? "operating"} className="input">
          <option value="operating">{text.kinds.operating}</option>
          <option value="asset">{text.kinds.asset}</option>
        </select>
      </div>
      {row && (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="active" defaultChecked={row.active} className="size-4 accent-brand-600" />
          {text.active}
        </label>
      )}
    </div>
  );
}

export function CategoryItem({ lang, row, title, text }: { lang: string; row: CategoryRow; title: string; text: Text }) {
  const [open, setOpen] = useState(false);
  return (
    <li className={`border-b border-line px-4 py-3 last:border-b-0 sm:px-6 ${row.active ? "" : "text-muted"}`}>
      <div className="flex items-center justify-between gap-3">
        <span className="min-w-0">
          <span className="block font-medium">{title}</span>
          <span className="block text-xs text-muted">
            {text.kinds[row.kind]}
            {!row.active && ` · ${text.inactive}`}
          </span>
        </span>
        {!open && (
          <button type="button" className="btn-ghost min-h-8 px-2 text-xs" onClick={() => setOpen(true)}>
            {text.edit}
          </button>
        )}
      </div>
      {open && (
        <ActionForm action={saveExpenseCategory} hidden={{ lang, id: row.id }} resetOnSuccess={false} onSuccess={() => setOpen(false)} className="mt-3 space-y-3">
          <CategoryFields row={row} text={text} />
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

export function AddCategory({ lang, text }: { lang: string; text: Text }) {
  const [open, setOpen] = useState(false);
  if (!open) {
    return (
      <button type="button" className="btn-secondary" onClick={() => setOpen(true)}>
        {text.addCategory}
      </button>
    );
  }
  return (
    <ActionForm action={saveExpenseCategory} hidden={{ lang }} onSuccess={() => setOpen(false)} className="card card-pad space-y-3">
      <CategoryFields text={text} />
      <div className="flex gap-2">
        <SubmitButton pendingLabel={text.saving}>{text.addCategory}</SubmitButton>
        <button type="button" className="btn-secondary" onClick={() => setOpen(false)}>
          {text.cancel}
        </button>
      </div>
    </ActionForm>
  );
}
