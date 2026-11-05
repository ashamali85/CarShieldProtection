import type { Dictionary, Locale } from "@/i18n";
import type { Expense, ExpenseCategory } from "@/db/schema";
import { saveExpense } from "@/lib/actions/finance";
import { ActionForm, Field, SubmitButton } from "@/components/forms";

export function ExpenseForm({
  lang,
  t,
  categories,
  today,
  expense,
  back,
}: {
  lang: Locale;
  t: Dictionary;
  categories: ExpenseCategory[];
  today: string;
  expense?: Expense;
  back?: string;
}) {
  const X = t.finance.expenses;
  const e = expense;
  const name = (c: ExpenseCategory) => (lang === "ar" ? c.nameAr : c.nameEn);
  return (
    <ActionForm action={saveExpense} hidden={{ lang, ...(e ? { id: e.id } : {}), ...(back ? { back } : {}) }} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={X.date} name="date" type="date" required defaultValue={e?.date ?? today} />
        <Field label={X.amount} name="amount" required inputMode="decimal" dir="ltr" placeholder="0.000" defaultValue={e ? (e.amountFils / 1000).toFixed(3) : ""} />
      </div>
      <div>
        <label htmlFor="f-categoryId" className="label">
          {X.category}
        </label>
        <select id="f-categoryId" name="categoryId" required defaultValue={e?.categoryId ?? ""} className="input">
          <option value="" disabled>
            —
          </option>
          {categories
            .filter((c) => c.active || c.id === e?.categoryId)
            .map((c) => (
              <option key={c.id} value={c.id}>
                {name(c)}
              </option>
            ))}
        </select>
      </div>
      <Field label={X.description} name="description" required defaultValue={e?.description} />
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="f-method" className="label">
            {X.method}
          </label>
          <select id="f-method" name="method" defaultValue={e?.method ?? "cash"} className="input">
            {(["cash", "knet", "card", "transfer"] as const).map((m) => (
              <option key={m} value={m}>
                {t.invoices.methods[m]}
              </option>
            ))}
          </select>
        </div>
        <Field label={X.vendor} name="vendor" defaultValue={e?.vendor ?? ""} optionalLabel={t.common.optional} />
      </div>
      <Field label={X.reference} name="reference" dir="ltr" defaultValue={e?.reference ?? ""} optionalLabel={t.common.optional} />
      <div className="flex gap-2">
        <SubmitButton className={e ? "btn-primary" : "btn-primary w-full"} pendingLabel={t.common.saving}>
          {e ? t.common.save : X.add}
        </SubmitButton>
        {e && back && (
          <a href={back} className="btn-secondary">
            {t.common.cancel}
          </a>
        )}
      </div>
    </ActionForm>
  );
}
