import type { Dictionary, Locale } from "@/i18n";
import { ActionForm, Field, SubmitButton } from "./forms";
import { VehiclePicker, type PickerLabels, type PickerMake } from "./vehicle-picker";
import { addVehicle } from "@/lib/actions/customers";

/** Plate, colour and VIN — shared by the add-vehicle and new-customer forms. */
export function VehicleExtraFields({ t }: { t: Dictionary }) {
  return (
    <div className="grid gap-4 sm:grid-cols-3">
      <Field label={t.vehicles.plate} name="plateNumber" required dir="ltr" placeholder="12-34567" autoComplete="off" />
      <Field label={t.vehicles.color} name="color" optionalLabel={t.common.optional} />
      <Field label={t.vehicles.vin} name="vin" dir="ltr" optionalLabel={t.common.optional} autoComplete="off" />
    </div>
  );
}

export function VehicleForm({
  lang,
  t,
  customerId,
  makes,
  labels,
  next,
}: {
  lang: Locale;
  t: Dictionary;
  customerId: string;
  makes: PickerMake[];
  labels: PickerLabels;
  next?: "job";
}) {
  return (
    <ActionForm action={addVehicle} hidden={{ lang, customerId, ...(next ? { next } : {}) }} className="space-y-4">
      <VehiclePicker makes={makes} labels={labels} lang={lang} />
      <VehicleExtraFields t={t} />
      <SubmitButton pendingLabel={t.common.saving}>{t.customers.addVehicle}</SubmitButton>
    </ActionForm>
  );
}
