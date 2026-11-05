import { Suspense } from "react";
import { notFound } from "next/navigation";
import { and, asc, desc, eq, gte, isNull } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { formatDate, formatMoney } from "@/i18n";
import { pageContext } from "@/lib/page";
import { todayKuwait } from "@/lib/dates";
import { addDaysIso, daysInMonth } from "@/lib/hr";
import { rateSegments, schedule } from "@/lib/accrual";
import { contractStatuses } from "@/lib/finance";
import { addContractRate, deleteContract, deleteContractRate, deleteExpense, linkExpenseToContract, recordContractPayment } from "@/lib/actions/finance";
import { UUID_RE } from "@/lib/actions/helpers";
import { ActionForm, Field, SubmitButton } from "@/components/forms";
import { PageHeader, PageSkeleton } from "@/components/ui";
import { ContractBadge, ContractForm } from "@/components/finance/contract-form";
import { RowDelete } from "@/components/finance/row-delete";
import { monthLabel } from "@/components/hr/ui";
import Link from "next/link";

export default function ContractPage(props: PageProps<"/[lang]/finance/contracts/[id]">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Contract {...props} />
    </Suspense>
  );
}

async function Contract({ params }: PageProps<"/[lang]/finance/contracts/[id]">) {
  const { lang, t } = await pageContext(params, { admin: true });
  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();
  const C = t.finance.contracts;
  const X = t.finance.expenses;
  const today = todayKuwait();
  const db = await getDb();
  const [contract] = await db.select().from(schema.recurringCosts).where(eq(schema.recurringCosts.id, id)).limit(1);
  if (!contract) notFound();
  const [rates, payments, categories, statuses, loose] = await Promise.all([
    db.select().from(schema.recurringCostRates).where(eq(schema.recurringCostRates.contractId, id)).orderBy(asc(schema.recurringCostRates.effectiveFrom)),
    db.select().from(schema.expenses).where(eq(schema.expenses.contractId, id)).orderBy(desc(schema.expenses.date), desc(schema.expenses.createdAt)),
    db.select().from(schema.expenseCategories).orderBy(asc(schema.expenseCategories.sortOrder), asc(schema.expenseCategories.nameEn)),
    contractStatuses(db, today),
    // Ordinary expenses in this category from around the start: likely rent paid before the contract was set up.
    db
      .select()
      .from(schema.expenses)
      .where(
        and(
          eq(schema.expenses.categoryId, contract.categoryId),
          isNull(schema.expenses.contractId),
          gte(schema.expenses.date, addDaysIso(contract.startDate, -92)),
        ),
      )
      .orderBy(desc(schema.expenses.date))
      .limit(100),
  ]);
  const status = statuses.find((s) => s.id === id)!;
  const money = (f: number) => formatMoney(Math.round(f), lang);
  const category = categories.find((c) => c.id === contract.categoryId);
  const catName = category ? (lang === "ar" ? category.nameAr : category.nameEn) : "";

  // Monthly charges up to the end of next month, newest first.
  const y = +today.slice(0, 4);
  const mo = +today.slice(5, 7);
  const nextY = mo === 12 ? y + 1 : y;
  const nextM = mo === 12 ? 1 : mo + 1;
  const until = `${nextY}-${String(nextM).padStart(2, "0")}-${daysInMonth(nextY, nextM)}`;
  const rows = schedule(rateSegments(rates, contract.startDate, contract.endDate), contract.startDate, contract.endDate, contract.dueDay, until)
    .reverse()
    .slice(0, 24);
  const back = `/${lang}/finance/contracts/${id}`;

  return (
    <>
      <PageHeader
        title={<span dir="auto">{contract.name}</span>}
        subtitle={[catName, contract.vendor].filter(Boolean).join(" · ")}
        back={{ href: `/${lang}/finance/contracts`, label: C.viewAll }}
      />

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { label: C.current, value: money(status.monthly) },
          { label: C.dueSoFar, value: money(status.dueSoFar) },
          { label: C.paid, value: money(status.paid) },
        ].map((k) => (
          <div key={k.label} className="card p-4">
            <p className="text-sm text-muted">{k.label}</p>
            <p className="num mt-1 text-xl font-semibold [overflow-wrap:anywhere]">{k.value}</p>
          </div>
        ))}
        <div className="card p-4">
          <p className="text-sm text-muted">{C.status}</p>
          <p className="mt-2">
            <ContractBadge balance={status.balance} ended={status.ended} money={money} C={C} />
          </p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="grid min-w-0 content-start gap-6 lg:col-span-2 [&>*]:min-w-0">
          <section className="card">
            <h2 className="section-title border-b border-line px-4 py-3.5 sm:px-6">{C.payments}</h2>
            {payments.length === 0 ? (
              <p className="px-4 py-6 text-sm text-muted sm:px-6">{C.noPayments}</p>
            ) : (
              <div className="table-wrap">
                <table className="table min-w-[36rem]">
                  <thead>
                    <tr>
                      <th>{X.date}</th>
                      <th>{X.description}</th>
                      <th>{X.method}</th>
                      <th className="text-end">{X.amount}</th>
                      <th>
                        <span className="sr-only">{t.common.actions}</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {payments.map((p) => (
                      <tr key={p.id}>
                        <td className="num whitespace-nowrap">{formatDate(p.date, lang)}</td>
                        <td>
                          <span dir="auto">{p.description}</span>
                          {p.reference && <span className="block text-xs text-muted">{p.reference}</span>}
                        </td>
                        <td className="text-muted">{t.invoices.methods[p.method]}</td>
                        <td className="num text-end font-medium">{money(p.amountFils)}</td>
                        <td>
                          <span className="flex justify-end gap-1">
                            <Link href={`/${lang}/finance/expenses/${p.id}?back=${encodeURIComponent(back)}`} className="btn-ghost min-h-8 px-2 text-xs">
                              {t.common.edit}
                            </Link>
                            <RowDelete action={deleteExpense} hidden={{ lang, id: p.id }} labels={{ delete: X.delete, confirm: `${X.delete}?`, cancel: t.common.cancel, saving: t.common.saving }} />
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {loose.length > 0 && (
            <section className="card border-amber-200">
              <div className="border-b border-line px-4 py-3.5 sm:px-6">
                <h2 className="section-title">{C.link.replace("{category}", catName)}</h2>
                <p className="hint">{C.linkHint}</p>
              </div>
              <ul>
                {loose.map((e) => (
                  <li key={e.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-line px-4 py-3 last:border-b-0 sm:px-6">
                    <span className="num text-sm whitespace-nowrap">{formatDate(e.date, lang)}</span>
                    <span className="min-w-0 flex-1 text-sm" dir="auto">
                      {e.description}
                    </span>
                    <span className="num text-sm font-medium">{money(e.amountFils)}</span>
                    <ActionForm action={linkExpenseToContract} hidden={{ lang, contractId: id, id: e.id }}>
                      <SubmitButton className="btn-secondary min-h-8 px-3 py-1 text-xs" pendingLabel={t.common.saving}>
                        {C.linkAction}
                      </SubmitButton>
                    </ActionForm>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="card">
            <h2 className="section-title border-b border-line px-4 py-3.5 sm:px-6">{C.schedule}</h2>
            <div className="table-wrap">
              <table className="table min-w-[28rem]">
                <thead>
                  <tr>
                    <th>{C.month}</th>
                    <th>{C.dueOn}</th>
                    <th className="text-end">{C.charged}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const upcoming = r.due > today;
                    return (
                      <tr key={r.key} className={upcoming ? "text-muted" : undefined}>
                        <td>
                          {monthLabel(+r.key.slice(0, 4), +r.key.slice(5, 7), lang)}
                          {upcoming && <span className="badge ms-2 bg-slate-100 text-slate-600">{C.upcoming}</span>}
                        </td>
                        <td className="num whitespace-nowrap">{formatDate(r.due, lang)}</td>
                        <td className="num text-end">{money(r.amount)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        </div>

        <aside className="grid min-w-0 content-start gap-6 [&>*]:min-w-0">
          <section className="card card-pad">
            <h2 className="section-title">{C.recordPayment}</h2>
            <p className="hint mb-4">{C.paymentHint}</p>
            <ActionForm action={recordContractPayment} hidden={{ lang, contractId: id }} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <Field label={X.date} name="date" type="date" required defaultValue={today} />
                <Field label={X.amount} name="amount" required inputMode="decimal" dir="ltr" defaultValue={(status.monthly / 1000).toFixed(3)} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="f-method" className="label">
                    {X.method}
                  </label>
                  <select id="f-method" name="method" className="input" defaultValue="transfer">
                    {(["cash", "knet", "card", "transfer"] as const).map((m) => (
                      <option key={m} value={m}>
                        {t.invoices.methods[m]}
                      </option>
                    ))}
                  </select>
                </div>
                <Field label={X.reference} name="reference" dir="ltr" optionalLabel={t.common.optional} />
              </div>
              <SubmitButton className="btn-primary w-full" pendingLabel={t.common.saving}>
                {C.recordPayment}
              </SubmitButton>
            </ActionForm>
          </section>

          <section className="card">
            <div className="border-b border-line px-4 py-3.5 sm:px-6">
              <h2 className="section-title">{C.rates}</h2>
              <p className="hint">{C.ratesHint}</p>
            </div>
            <ul>
              {rates.map((r, i) => (
                <li key={r.id} className="flex items-center gap-3 border-b border-line px-4 py-2.5 text-sm sm:px-6">
                  <span className="text-muted">{C.rateFrom}</span>
                  <span className="num">{formatDate(r.effectiveFrom, lang)}</span>
                  <span className="num ms-auto font-medium">{money(r.monthlyFils)}</span>
                  <span className="flex w-14 justify-end">
                    {i > 0 && (
                      <RowDelete action={deleteContractRate} hidden={{ lang, id: r.id, contractId: id }} labels={{ delete: X.delete, confirm: `${X.delete}?`, cancel: t.common.cancel, saving: t.common.saving }} />
                    )}
                  </span>
                </li>
              ))}
            </ul>
            <ActionForm action={addContractRate} hidden={{ lang, contractId: id }} className="grid grid-cols-2 items-end gap-3 px-4 py-4 sm:px-6">
              <Field label={C.rateFrom} name="effectiveFrom" type="date" required min={contract.startDate} />
              <Field label={C.monthly} name="monthly" required inputMode="decimal" dir="ltr" placeholder="0.000" />
              <SubmitButton className="btn-secondary col-span-2" pendingLabel={t.common.saving}>
                {C.addRate}
              </SubmitButton>
            </ActionForm>
          </section>

          <section className="card card-pad">
            <h2 className="section-title mb-4">{C.edit}</h2>
            <ContractForm lang={lang} t={t} categories={categories} today={today} contract={contract} />
            {payments.length === 0 && (
              <div className="mt-4 flex justify-end border-t border-line pt-4">
                <RowDelete action={deleteContract} hidden={{ lang, id }} labels={{ delete: C.delete, confirm: C.deleteConfirm, cancel: t.common.cancel, saving: t.common.saving }} />
              </div>
            )}
          </section>
        </aside>
      </div>
    </>
  );
}
