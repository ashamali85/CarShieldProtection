"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import type { BodyType } from "@/db/schema";
import { deleteMake, deleteModel, updateMake, updateModel } from "@/lib/actions/catalog";
import { ActionForm, Field, SubmitButton, type FormAction } from "@/components/forms";
import { CarBrandBadge } from "@/components/logo";

type CatalogText = {
  edit: string;
  cancel: string;
  save: string;
  saving: string;
  saved: string;
  delete: string;
  hide: string;
  show: string;
  onSale: string;
  editBrand: string;
  brandEn: string;
  brandAr: string;
  logo: string;
  logoHint: string;
  useBuiltInLogo: string;
  noLogo: string;
  customLogo: string;
  builtInLogo: string;
  modelName: string;
  bodyType: string;
  yearFrom: string;
  yearTo: string;
  yearToHint: string;
  deleteBrand: string;
  deleteModel: string;
  deleteBrandTitle: string;
  deleteModelTitle: string;
  deleteBrandBody: string;
  deleteModelBody: string;
  modelsAffected: string;
  carsLinked: string;
  carsKeep: string;
  confirmDeleteBrand: string;
  confirmDeleteModel: string;
};

/**
 * A destructive action behind an explicit confirmation step that names what will be lost.
 * Nothing is deleted until the second, clearly labelled button is pressed.
 */
export function ConfirmDelete({
  triggerLabel,
  title,
  body,
  facts,
  confirmLabel,
  cancelLabel,
  pendingLabel,
  action,
  hidden,
  triggerClassName = "btn-danger",
  onDone,
}: {
  triggerLabel: string;
  title: string;
  body: ReactNode;
  facts?: { label: string; value: string }[];
  confirmLabel: string;
  cancelLabel: string;
  pendingLabel: string;
  action: FormAction;
  hidden: Record<string, string>;
  triggerClassName?: string;
  onDone?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const wasOpen = useRef(false);

  useEffect(() => {
    if (open) headingRef.current?.focus();
    else if (wasOpen.current) triggerRef.current?.focus();
    wasOpen.current = open;
  }, [open]);

  if (!open) {
    return (
      <button ref={triggerRef} type="button" className={triggerClassName} onClick={() => setOpen(true)}>
        {triggerLabel}
      </button>
    );
  }
  return (
    <div
      role="group"
      aria-labelledby="confirm-delete-title"
      className="w-full rounded-xl border border-red-200 bg-red-50/70 p-4 text-start"
      onKeyDown={(e) => e.key === "Escape" && setOpen(false)}
    >
      <h3 id="confirm-delete-title" ref={headingRef} tabIndex={-1} className="text-sm font-semibold text-red-900 outline-none">
        {title}
      </h3>
      <div className="mt-1 text-sm text-red-900/80">{body}</div>
      {facts && facts.length > 0 && (
        <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
          {facts.map((f) => (
            <div key={f.label} className="rounded-lg bg-white/70 px-3 py-2 ring-1 ring-red-100">
              <dt className="text-xs text-red-900/70">{f.label}</dt>
              <dd className="num font-semibold text-red-950">{f.value}</dd>
            </div>
          ))}
        </dl>
      )}
      <ActionForm action={action} hidden={hidden} onSuccess={onDone} className="mt-4 flex flex-wrap gap-2">
        <SubmitButton className="btn border border-red-700 bg-red-600 text-white hover:bg-red-700" pendingLabel={pendingLabel}>
          {confirmLabel}
        </SubmitButton>
        <button type="button" className="btn-secondary" onClick={() => setOpen(false)}>
          {cancelLabel}
        </button>
      </ActionForm>
    </div>
  );
}

/** Saved confirmation that clears itself. */
function useFlash(ms = 2500) {
  const [on, setOn] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  const flash = useCallback(() => {
    setOn(true);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setOn(false), ms);
  }, [ms]);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  return [on, flash] as const;
}

export function BrandEditor({
  lang,
  make,
  logoSrc,
  hasCustomLogo,
  hasBuiltInLogo,
  modelCount,
  carCount,
  text,
}: {
  lang: string;
  make: { id: string; name: string; nameAr: string };
  logoSrc: string | null;
  hasCustomLogo: boolean;
  hasBuiltInLogo: boolean;
  modelCount: string;
  carCount: string;
  text: CatalogText;
}) {
  const [saved, flash] = useFlash();
  const [preview, setPreview] = useState<string | null>(null);
  const [fileKey, setFileKey] = useState(0);

  useEffect(() => () => {
    if (preview) URL.revokeObjectURL(preview);
  }, [preview]);

  return (
    <section className="card card-pad content-start">
      <h2 className="section-title mb-4">{text.editBrand}</h2>
      <ActionForm
        action={updateMake}
        hidden={{ lang, id: make.id }}
        resetOnSuccess={false}
        onSuccess={() => {
          flash();
          setPreview(null);
          setFileKey((k) => k + 1);
        }}
        className="space-y-4"
      >
        <Field key={`n-${make.name}`} label={text.brandEn} name="name" required dir="ltr" autoComplete="off" defaultValue={make.name} />
        <Field key={`a-${make.nameAr}`} label={text.brandAr} name="nameAr" required dir="rtl" lang="ar" autoComplete="off" defaultValue={make.nameAr} />
        <div>
          <span className="label">{text.logo}</span>
          <div className="flex items-center gap-3">
            <CarBrandBadge src={preview ?? logoSrc} name={make.name} className="size-16" />
            <p className="text-xs text-muted">
              {preview ? "" : hasCustomLogo ? text.customLogo : hasBuiltInLogo ? text.builtInLogo : text.noLogo}
            </p>
          </div>
          <label htmlFor="f-logo" className="sr-only">
            {text.logo}
          </label>
          <input
            key={fileKey}
            id="f-logo"
            name="logo"
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="mt-3 block w-full text-sm text-muted file:me-3 file:rounded-lg file:border file:border-silver-300 file:bg-white file:px-3 file:py-2 file:text-sm file:font-medium file:text-ink hover:file:bg-silver-100"
            onChange={(e) => {
              const f = e.currentTarget.files?.[0];
              setPreview(f ? URL.createObjectURL(f) : null);
            }}
          />
          <p className="hint">{text.logoHint}</p>
          {hasCustomLogo && (
            <label className="mt-2 flex items-start gap-2 text-sm">
              <input type="checkbox" name="removeLogo" value="1" className="mt-0.5 size-4 accent-brand-600" />
              {text.useBuiltInLogo}
            </label>
          )}
        </div>
        <div className="flex items-center gap-3">
          <SubmitButton className="btn-primary" pendingLabel={text.saving}>
            {text.save}
          </SubmitButton>
          <p role="status" className="text-sm text-emerald-700">
            {saved ? text.saved : ""}
          </p>
        </div>
      </ActionForm>

      <div className="mt-6 border-t border-line pt-5">
        <ConfirmDelete
          triggerLabel={text.deleteBrand}
          title={text.deleteBrandTitle}
          body={
            <>
              <p>{text.deleteBrandBody}</p>
              <p className="mt-1">{text.carsKeep}</p>
            </>
          }
          facts={[
            { label: text.modelsAffected, value: modelCount },
            { label: text.carsLinked, value: carCount },
          ]}
          confirmLabel={text.confirmDeleteBrand}
          cancelLabel={text.cancel}
          pendingLabel={text.saving}
          action={deleteMake}
          hidden={{ lang, id: make.id }}
        />
      </div>
    </section>
  );
}

export function ModelRow({
  lang,
  makeId,
  model,
  carCount,
  bodyOptions,
  text,
  toggle,
}: {
  lang: string;
  makeId: string;
  model: { id: string; name: string; bodyType: BodyType; yearFrom: number; yearTo: number | null; active: boolean };
  carCount: string;
  bodyOptions: { value: BodyType; label: string }[];
  text: CatalogText;
  /** The Hide/Show form, rendered on the server. */
  toggle: ReactNode;
}) {
  const [mode, setMode] = useState<"view" | "edit" | "delete">("view");

  if (mode === "edit") {
    return (
      <li className="border-b border-line bg-brand-50/40 px-4 py-4 last:border-b-0 sm:px-6">
        <ActionForm
          action={updateModel}
          hidden={{ lang, id: model.id, makeId }}
          resetOnSuccess={false}
          onSuccess={() => setMode("view")}
          className="grid gap-3 sm:grid-cols-2"
        >
          <Field label={text.modelName} name="name" required dir="ltr" autoComplete="off" defaultValue={model.name} autoFocus />
          <div>
            <label htmlFor={`body-${model.id}`} className="label">
              {text.bodyType}
            </label>
            <select id={`body-${model.id}`} name="bodyType" defaultValue={model.bodyType} className="input">
              {bodyOptions.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <Field label={text.yearFrom} name="yearFrom" required type="number" min={1950} inputMode="numeric" defaultValue={model.yearFrom} />
          <Field label={text.yearTo} name="yearTo" type="number" min={1950} inputMode="numeric" defaultValue={model.yearTo ?? ""} hint={text.yearToHint} />
          <div className="flex gap-2 sm:col-span-2">
            <SubmitButton className="btn-primary" pendingLabel={text.saving}>
              {text.save}
            </SubmitButton>
            <button type="button" className="btn-secondary" onClick={() => setMode("view")}>
              {text.cancel}
            </button>
          </div>
        </ActionForm>
      </li>
    );
  }

  return (
    <li className={`border-b border-line px-4 py-2.5 text-sm last:border-b-0 sm:px-6 ${model.active ? "" : "text-muted"}`}>
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <span className="min-w-0 flex-1 basis-40" dir="ltr">
          <span className="block truncate text-start font-medium">{model.name}</span>
        </span>
        <span className="-me-2 flex shrink-0 items-center gap-1 sm:gap-2">
          <span className="num me-1 text-muted">
            {model.yearFrom}–{model.yearTo ?? text.onSale}
          </span>
          <button type="button" className="btn-ghost min-h-8 px-2 text-xs" onClick={() => setMode("edit")}>
            {text.edit}
          </button>
          {toggle}
          {mode === "view" && (
            <button type="button" className="btn-ghost min-h-8 px-2 text-xs text-red-700 hover:bg-red-50 hover:text-red-800" onClick={() => setMode("delete")}>
              {text.delete}
            </button>
          )}
        </span>
      </div>
      {mode === "delete" && (
        <div className="mt-2">
          <DeleteModelPanel lang={lang} makeId={makeId} model={model} carCount={carCount} text={text} onCancel={() => setMode("view")} />
        </div>
      )}
    </li>
  );
}

/** The delete confirmation for one model, opened straight away from its row. */
function DeleteModelPanel({
  lang,
  makeId,
  model,
  carCount,
  text,
  onCancel,
}: {
  lang: string;
  makeId: string;
  model: { id: string; name: string };
  carCount: string;
  text: CatalogText;
  onCancel: () => void;
}) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => headingRef.current?.focus(), []);
  return (
    <div
      role="group"
      aria-labelledby={`del-${model.id}`}
      className="rounded-xl border border-red-200 bg-red-50/70 p-4"
      onKeyDown={(e) => e.key === "Escape" && onCancel()}
    >
      <h3 id={`del-${model.id}`} ref={headingRef} tabIndex={-1} className="text-sm font-semibold text-red-900 outline-none">
        {text.deleteModelTitle} <span dir="ltr">({model.name})</span>
      </h3>
      <p className="mt-1 text-sm text-red-900/80">{text.deleteModelBody}</p>
      <p className="mt-1 text-sm text-red-900/80">
        {text.carsLinked}: <span className="num font-semibold">{carCount}</span> · {text.carsKeep}
      </p>
      <ActionForm action={deleteModel} hidden={{ lang, id: model.id, makeId }} className="mt-3 flex flex-wrap gap-2">
        <SubmitButton className="btn border border-red-700 bg-red-600 text-white hover:bg-red-700" pendingLabel={text.saving}>
          {text.confirmDeleteModel}
        </SubmitButton>
        <button type="button" className="btn-secondary" onClick={onCancel}>
          {text.cancel}
        </button>
      </ActionForm>
    </div>
  );
}

export type { CatalogText };
