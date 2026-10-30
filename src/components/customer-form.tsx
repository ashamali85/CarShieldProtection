import type { Dictionary, Locale } from "@/i18n";
import type { Customer } from "@/db/schema";
import { ActionForm, Field, SubmitButton, type FormAction } from "./forms";
import { VehiclePicker, type PickerLabels, type PickerMake } from "./vehicle-picker";
import { VehicleExtraFields } from "./vehicle-form";

export function CustomerForm({
  action,
  lang,
  t,
  customer,
  cancelHref,
  vehicle,
}: {
  action: FormAction;
  lang: Locale;
  t: Dictionary;
  customer?: Customer;
  cancelHref: string;
  /** New customers are created together with their first car. */
  vehicle?: { makes: PickerMake[]; labels: PickerLabels };
}) {
  return (
    <ActionForm action={action} hidden={{ lang, ...(customer ? { id: customer.id } : {}) }} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t.customers.name} name="name" required defaultValue={customer?.name} autoComplete="off" />
        <Field label={t.customers.phone} name="phone" type="tel" required dir="ltr" defaultValue={customer?.phone} inputMode="tel" />
        <Field label={t.customers.email} name="email" type="email" dir="ltr" defaultValue={customer?.email ?? ""} optionalLabel={t.common.optional} />
        <Field label={t.customers.civilId} name="civilId" dir="ltr" inputMode="numeric" defaultValue={customer?.civilId ?? ""} optionalLabel={t.common.optional} />
      </div>
      <div>
        <label htmlFor="f-notes" className="label">
          {t.common.notes} <span className="font-normal text-muted">({t.common.optional})</span>
        </label>
        <textarea id="f-notes" name="notes" rows={3} className="input" defaultValue={customer?.notes ?? ""} />
      </div>
      {vehicle && (
        <fieldset className="space-y-4 border-t border-line pt-5">
          <legend className="section-title float-start mb-1 w-full">{t.vehicles.carDetails}</legend>
          <div className="clear-both space-y-4">
            <VehiclePicker makes={vehicle.makes} labels={vehicle.labels} lang={lang} />
            <VehicleExtraFields t={t} />
          </div>
        </fieldset>
      )}
      <div className="flex gap-2">
        <SubmitButton pendingLabel={t.common.saving}>{t.common.save}</SubmitButton>
        <a href={cancelHref} className="btn-secondary">
          {t.common.cancel}
        </a>
      </div>
    </ActionForm>
  );
}
