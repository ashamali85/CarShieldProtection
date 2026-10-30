import type { Dictionary, Locale } from "@/i18n";
import type { InventoryItem, InventoryUnit } from "@/db/schema";
import { saveInventoryItem } from "@/lib/actions/inventory";
import { ActionForm, Field, SubmitButton } from "./forms";

export const UNITS: InventoryUnit[] = ["piece", "roll", "meter", "sqm", "ml", "liter", "box", "pack"];

const qty = (milli: number) => String(milli / 1000);

export function InventoryForm({ lang, t, item }: { lang: Locale; t: Dictionary; item?: InventoryItem }) {
  const cancel = item ? `/${lang}/inventory/${item.id}` : `/${lang}/inventory`;
  return (
    <ActionForm action={saveInventoryItem} hidden={{ lang, ...(item ? { id: item.id } : {}) }} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t.inventory.nameEn} name="nameEn" required dir="ltr" defaultValue={item?.nameEn} placeholder="PPF film roll 1.52 m" />
        <Field label={t.inventory.nameAr} name="nameAr" required dir="rtl" lang="ar" defaultValue={item?.nameAr} />
        <Field label={t.inventory.sku} name="sku" dir="ltr" defaultValue={item?.sku ?? ""} optionalLabel={t.common.optional} />
        <div>
          <label htmlFor="f-unit" className="label">
            {t.inventory.unit}
          </label>
          <select id="f-unit" name="unit" className="input" defaultValue={item?.unit ?? "piece"}>
            {UNITS.map((u) => (
              <option key={u} value={u}>
                {t.inventory.unitNames[u]}
              </option>
            ))}
          </select>
        </div>
        {!item && (
          <Field label={t.inventory.openingStock} name="openingStock" inputMode="decimal" dir="ltr" placeholder="0" optionalLabel={t.common.optional} />
        )}
        <Field
          label={t.inventory.reorderLevel}
          name="reorderLevel"
          inputMode="decimal"
          dir="ltr"
          defaultValue={item ? qty(item.reorderLevelMilli) : ""}
          placeholder="0"
          hint={t.inventory.reorderHint}
        />
        <Field
          label={t.inventory.unitCost}
          name="unitCost"
          inputMode="decimal"
          dir="ltr"
          placeholder="0.000"
          defaultValue={item?.unitCostFils != null ? (item.unitCostFils / 1000).toFixed(3) : ""}
          optionalLabel={t.common.optional}
        />
      </div>
      {item && (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="active" defaultChecked={item.active} className="size-4 accent-brand-600" />
          {t.common.active}
        </label>
      )}
      {!item && <input type="hidden" name="active" value="on" />}
      <div className="flex gap-2">
        <SubmitButton pendingLabel={t.common.saving}>{t.common.save}</SubmitButton>
        <a href={cancel} className="btn-secondary">
          {t.common.cancel}
        </a>
      </div>
    </ActionForm>
  );
}

export function StockLevel({
  onHand,
  reorder,
  unit,
  lang,
  t,
  format,
}: {
  onHand: number;
  reorder: number;
  unit: InventoryUnit;
  lang: Locale;
  t: Dictionary;
  format: (milli: number, lang: Locale) => string;
}) {
  const state = onHand <= 0 ? "out" : onHand <= reorder ? "low" : "ok";
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <span className={`num font-medium ${state === "out" ? "text-red-700" : state === "low" ? "text-amber-800" : ""}`}>
        {format(onHand, lang)} {t.inventory.units[unit]}
      </span>
      {state !== "ok" && (
        <span className={`badge ${state === "out" ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-800"}`}>
          {state === "out" ? t.inventory.out : t.inventory.low}
        </span>
      )}
    </span>
  );
}
