import type { Dictionary, Locale } from "@/i18n";
import type { Service, ServiceCategory } from "@/db/schema";
import { saveService } from "@/lib/actions/admin";
import { ActionForm, Field, SubmitButton } from "./forms";

const CATEGORIES: ServiceCategory[] = ["ppf", "ceramic", "tint", "detailing", "other"];

export function ServiceForm({ lang, t, service }: { lang: Locale; t: Dictionary; service?: Service }) {
  return (
    <ActionForm action={saveService} hidden={{ lang, ...(service ? { id: service.id } : {}) }} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t.services.nameEn} name="nameEn" required dir="ltr" defaultValue={service?.nameEn} />
        <Field label={t.services.nameAr} name="nameAr" required dir="rtl" lang="ar" defaultValue={service?.nameAr} />
        <div>
          <label htmlFor="f-category" className="label">
            {t.services.category}
          </label>
          <select id="f-category" name="category" className="input" defaultValue={service?.category ?? "ppf"}>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {t.services.categories[c]}
              </option>
            ))}
          </select>
        </div>
        <Field
          label={t.services.price}
          name="price"
          required
          inputMode="decimal"
          dir="ltr"
          placeholder="0.000"
          defaultValue={service ? (service.priceFils / 1000).toFixed(3) : ""}
        />
        <Field
          label={t.services.warranty}
          name="warrantyMonths"
          type="number"
          min={0}
          max={240}
          inputMode="numeric"
          defaultValue={service?.warrantyMonths ?? 0}
          hint={`0 = ${t.services.noWarranty}`}
        />
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="active" defaultChecked={service?.active ?? true} className="size-4 accent-brand-600" />
        {t.common.active}
      </label>
      <div className="flex gap-2">
        <SubmitButton pendingLabel={t.common.saving}>{t.common.save}</SubmitButton>
        <a href={`/${lang}/services`} className="btn-secondary">
          {t.common.cancel}
        </a>
      </div>
    </ActionForm>
  );
}
