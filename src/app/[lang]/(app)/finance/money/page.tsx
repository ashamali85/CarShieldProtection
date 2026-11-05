import { Suspense } from "react";
import { and, desc, gte, lte } from "drizzle-orm";
import { getDb, schema } from "@/db";
import type { CashEntryKind } from "@/db/schema";
import { formatDate, formatMoney } from "@/i18n";
import { pageContext } from "@/lib/page";
import { todayKuwait } from "@/lib/dates";
import { parsePeriod } from "@/lib/period";
import { periodLabels, periodTitle, pickerYears } from "@/lib/finance-ui";
import { deleteCashEntry, saveCashEntry } from "@/lib/actions/finance";
import { ActionForm, Field, SubmitButton } from "@/components/forms";
import { EmptyState, PageHeader, PageSkeleton } from "@/components/ui";
import { PeriodPicker } from "@/components/finance/period-picker";
import { RowDelete } from "@/components/finance/row-delete";

const INFLOW: CashEntryKind[] = ["capital_in", "loan_received", "other_income"];

export default function MoneyPage(props: PageProps<"/[lang]/finance/money">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Money {...props} />
    </Suspense>
  );
}

async function Money({ params, searchParams }: PageProps<"/[lang]/finance/money">) {
  const { lang, t } = await pageContext(params, { admin: true });
  const M = t.finance.money;
  const today = todayKuwait();
  const period = parsePeriod(await searchParams, today, "year");
  const db = await getDb();
  const [rows, years] = await Promise.all([
    db
      .select()
      .from(schema.cashEntries)
      .where(and(gte(schema.cashEntries.date, period.from), lte(schema.cashEntries.date, period.to)))
      .orderBy(desc(schema.cashEntries.date), desc(schema.cashEntries.createdAt)),
    pickerYears(db, +today.slice(0, 4)),
  ]);
  const money = (f: number) => formatMoney(f, lang);

  return (
    <>
      <PageHeader title={`${M.title} · ${periodTitle(period, lang)}`} subtitle={M.subtitle} />
      <PeriodPicker lang={lang} {...period} years={years} labels={periodLabels(t)} />
      <div className="grid gap-6 lg:grid-cols-3">
        <section className="card min-w-0 lg:col-span-2">
          {rows.length === 0 ? (
            <EmptyState icon="revenue" message={M.empty} />
          ) : (
            <div className="table-wrap">
              <table className="table min-w-[36rem]">
                <thead>
                  <tr>
                    <th>{t.finance.expenses.date}</th>
                    <th>{M.kind}</th>
                    <th>{t.finance.expenses.method}</th>
                    <th className="text-end">{t.finance.expenses.amount}</th>
                    <th>
                      <span className="sr-only">{t.common.actions}</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const inflow = INFLOW.includes(r.kind);
                    return (
                      <tr key={r.id}>
                        <td className="num whitespace-nowrap">{formatDate(r.date, lang)}</td>
                        <td>
                          {M.kinds[r.kind]}
                          {r.description && <span className="block text-xs text-muted">{r.description}</span>}
                        </td>
                        <td className="text-muted">{t.invoices.methods[r.method]}</td>
                        <td className={`num text-end font-medium ${inflow ? "text-emerald-700" : "text-red-700"}`}>
                          {inflow ? "+" : "−"}
                          {money(r.amountFils)}
                        </td>
                        <td>
                          <span className="flex justify-end">
                            <RowDelete
                              action={deleteCashEntry}
                              hidden={{ lang, id: r.id }}
                              labels={{ delete: t.finance.expenses.delete, confirm: `${t.finance.expenses.delete}?`, cancel: t.common.cancel, saving: t.common.saving }}
                            />
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
        <section className="card card-pad content-start">
          <h2 className="section-title mb-4">{M.add}</h2>
          <ActionForm action={saveCashEntry} hidden={{ lang }} className="space-y-4">
            <div>
              <label htmlFor="f-kind" className="label">
                {M.kind}
              </label>
              <select id="f-kind" name="kind" className="input" defaultValue="capital_in">
                <optgroup label={M.direction.in}>
                  {INFLOW.map((k) => (
                    <option key={k} value={k}>
                      {M.kinds[k]}
                    </option>
                  ))}
                </optgroup>
                <optgroup label={M.direction.out}>
                  {(["owner_drawing", "loan_repayment"] as const).map((k) => (
                    <option key={k} value={k}>
                      {M.kinds[k]}
                    </option>
                  ))}
                </optgroup>
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label={t.finance.expenses.date} name="date" type="date" required defaultValue={today} />
              <Field label={t.finance.expenses.amount} name="amount" required inputMode="decimal" dir="ltr" placeholder="0.000" />
            </div>
            <div>
              <label htmlFor="f-method" className="label">
                {t.finance.expenses.method}
              </label>
              <select id="f-method" name="method" className="input" defaultValue="transfer">
                {(["cash", "knet", "card", "transfer"] as const).map((m) => (
                  <option key={m} value={m}>
                    {t.invoices.methods[m]}
                  </option>
                ))}
              </select>
            </div>
            <Field label={t.finance.expenses.description} name="description" optionalLabel={t.common.optional} />
            <SubmitButton className="btn-primary w-full" pendingLabel={t.common.saving}>
              {M.add}
            </SubmitButton>
          </ActionForm>
        </section>
      </div>
    </>
  );
}
