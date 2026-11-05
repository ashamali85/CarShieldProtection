import type { Dictionary, Locale } from "@/i18n";
import type { ExpenseCategory, RecurringCost } from "@/db/schema";
import { saveContract } from "@/lib/actions/finance";
import { ActionForm, Field, SubmitButton } from "@/components/forms";

/** Create or edit a recurring cost (e.g. a lease). The monthly amount is only asked for when creating. */
export function ContractForm({ lang, t, categories, today, contract }: { lang: Locale; t: Dictionary; categories: ExpenseCategory[]; today: string; contract?: RecurringCost }) {
  const C = t.finance.contracts;
  const c = contract;
  const rent = categories.find((x) => x.code === "rent");
  const options = categories.filter((x) => x.kind === "operating" && (x.active || x.id === c?.categoryId));
  return (
    <ActionForm action={saveContract} hidden={{ lang, ...(c ? { id: c.id } : {}) }} resetOnSuccess={!c} className="space-y-4">
      <Field label={C.name} name="name" required placeholder={C.namePlaceholder} defaultValue={c?.name} />
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="f-categoryId" className="label">
            {C.category}
          </label>
          <select id="f-categoryId" name="categoryId" required className="input" defaultValue={c?.categoryId ?? rent?.id ?? ""}>
            {options.map((x) => (
              <option key={x.id} value={x.id}>
                {lang === "ar" ? x.nameAr : x.nameEn}
              </option>
            ))}
          </select>
        </div>
        <Field label={C.vendor} name="vendor" defaultValue={c?.vendor ?? ""} optionalLabel={t.common.optional} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={C.start} name="startDate" type="date" required defaultValue={c?.startDate ?? today} />
        <Field label={C.end} name="endDate" type="date" defaultValue={c?.endDate ?? ""} optionalLabel={t.common.optional} hint={C.endHint} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {!c && <Field label={C.monthly} name="monthly" required inputMode="decimal" dir="ltr" placeholder="0.000" />}
        <Field label={C.dueDay} name="dueDay" type="number" min={1} max={28} required defaultValue={c?.dueDay ?? 1} hint={C.dueDayHint} dir="ltr" />
      </div>
      <Field label={C.notes} name="notes" defaultValue={c?.notes ?? ""} optionalLabel={t.common.optional} />
      <SubmitButton className={c ? "btn-primary" : "btn-primary w-full"} pendingLabel={t.common.saving}>
        {c ? t.common.save : C.add}
      </SubmitButton>
    </ActionForm>
  );
}

/** Behind / paid ahead / up to date / ended, as a badge. */
export function ContractBadge({ balance, ended, money, C }: { balance: number; ended: boolean; money: (f: number) => string; C: Dictionary["finance"]["contracts"] }) {
  if (balance > 0) return <span className="badge rounded-lg whitespace-normal bg-red-100 text-red-700">{C.behind.replace("{amount}", money(balance))}</span>;
  if (balance < 0) return <span className="badge rounded-lg whitespace-normal bg-sky-100 text-sky-800">{C.ahead.replace("{amount}", money(-balance))}</span>;
  if (ended) return <span className="badge bg-slate-100 text-slate-600">{C.ended}</span>;
  return <span className="badge bg-emerald-100 text-emerald-800">{C.upToDate}</span>;
}
