import type { Dictionary, Locale } from "@/i18n";
import { ActionForm, Field, SubmitButton } from "./forms";
import { addVehicle } from "@/lib/actions/customers";

export function VehicleForm({
  lang,
  t,
  customerId,
  next,
}: {
  lang: Locale;
  t: Dictionary;
  customerId: string;
  next?: "job";
}) {
  return (
    <ActionForm action={addVehicle} hidden={{ lang, customerId, ...(next ? { next } : {}) }} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label={t.vehicles.make} name="make" required placeholder="Toyota" />
        <Field label={t.vehicles.model} name="model" required placeholder="Land Cruiser" />
        <Field label={t.vehicles.plate} name="plateNumber" required dir="ltr" placeholder="12-34567" />
        <Field label={t.vehicles.year} name="year" type="number" min={1950} max={2100} inputMode="numeric" optionalLabel={t.common.optional} />
        <Field label={t.vehicles.color} name="color" optionalLabel={t.common.optional} />
        <Field label={t.vehicles.vin} name="vin" dir="ltr" optionalLabel={t.common.optional} />
      </div>
      <SubmitButton pendingLabel={t.common.saving}>{t.customers.addVehicle}</SubmitButton>
    </ActionForm>
  );
}
