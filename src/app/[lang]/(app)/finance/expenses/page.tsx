import { Suspense } from "react";
import Link from "next/link";
import { and, asc, desc, eq, gte, lte } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { formatDate, formatMoney } from "@/i18n";
import { first, pageContext } from "@/lib/page";
import { todayKuwait } from "@/lib/dates";
import { parsePeriod, periodQuery } from "@/lib/period";
import { periodLabels, periodTitle, pickerYears } from "@/lib/finance-ui";
import { deleteExpense } from "@/lib/actions/finance";
import { UUID_RE } from "@/lib/actions/helpers";
import { EmptyState, PageHeader, PageSkeleton } from "@/components/ui";
import { PeriodPicker } from "@/components/finance/period-picker";
import { ExpenseForm } from "@/components/finance/expense-form";
import { ShareBars } from "@/components/finance/month-chart";
import { RowDelete } from "@/components/finance/row-delete";

export default function ExpensesPage(props: PageProps<"/[lang]/finance/expenses">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Expenses {...props} />
    </Suspense>
  );
}

async function Expenses({ params, searchParams }: PageProps<"/[lang]/finance/expenses">) {
  const { lang, t } = await pageContext(params, { admin: true });
  const X = t.finance.expenses;
  const sp = await searchParams;
  const today = todayKuwait();
  const period = parsePeriod(sp, today);
  const cat = first(sp.cat);
  const db = await getDb();
  const [categories, rows, years] = await Promise.all([
    db.select().from(schema.expenseCategories).orderBy(asc(schema.expenseCategories.sortOrder), asc(schema.expenseCategories.nameEn)),
    db
      .select()
      .from(schema.expenses)
      .where(and(gte(schema.expenses.date, period.from), lte(schema.expenses.date, period.to), UUID_RE.test(cat) ? eq(schema.expenses.categoryId, cat) : undefined))
      .orderBy(desc(schema.expenses.date), desc(schema.expenses.createdAt)),
    pickerYears(db, +today.slice(0, 4)),
  ]);
  const byId = new Map(categories.map((c) => [c.id, c]));
  const name = (id: string) => {
    const c = byId.get(id);
    return c ? (lang === "ar" ? c.nameAr : c.nameEn) : "—";
  };
  const money = (f: number) => formatMoney(f, lang);
  const total = rows.reduce((a, r) => a + r.amountFils, 0);
  const totals = new Map<string, number>();
  for (const r of rows) totals.set(r.categoryId, (totals.get(r.categoryId) ?? 0) + r.amountFils);
  const here = `/${lang}/finance/expenses${periodQuery(period)}${UUID_RE.test(cat) ? `&cat=${cat}` : ""}`;

  return (
    <>
      <PageHeader title={`${X.title} · ${periodTitle(period, lang)}`} />
      <PeriodPicker lang={lang} {...period} years={years} labels={periodLabels(t)} />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="grid min-w-0 content-start gap-6 lg:col-span-2 [&>*]:min-w-0">
          <form method="get" className="flex flex-wrap items-center gap-2">
            {Object.entries({ p: period.kind, y: String(period.year), m: String(period.month), q: String(period.quarter), from: period.from, to: period.to }).map(([k, v]) => (
              <input key={k} type="hidden" name={k} value={v} />
            ))}
            <label htmlFor="cat" className="sr-only">
              {X.category}
            </label>
            <select id="cat" name="cat" defaultValue={cat} className="input min-h-9 w-auto py-1.5 text-sm">
              <option value="">{X.allCategories}</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {lang === "ar" ? c.nameAr : c.nameEn}
                </option>
              ))}
            </select>
            <button type="submit" className="btn-secondary min-h-9 py-1.5">
              {t.finance.period.apply}
            </button>
            <p className="ms-auto text-sm">
              {X.total}: <span className="num font-semibold">{money(total)}</span>
            </p>
          </form>
          <section className="card">
            {rows.length === 0 ? (
              <EmptyState icon="due" message={X.empty} />
            ) : (
              <div className="table-wrap">
                <table className="table min-w-[44rem]">
                  <thead>
                    <tr>
                      <th>{X.date}</th>
                      <th>{X.category}</th>
                      <th>{X.description}</th>
                      <th>{X.method}</th>
                      <th className="text-end">{X.amount}</th>
                      <th>
                        <span className="sr-only">{t.common.actions}</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.id}>
                        <td className="num whitespace-nowrap">{formatDate(r.date, lang)}</td>
                        <td>
                          {name(r.categoryId)}
                          {byId.get(r.categoryId)?.kind === "asset" && <span className="badge ms-1.5 bg-sky-100 text-sky-800">{X.asset}</span>}
                        </td>
                        <td>
                          <span className="auto-dir" dir="auto">
                            {r.description}
                          </span>
                          {(r.vendor || r.reference) && (
                            <span className="block text-xs text-muted">
                              {[r.vendor, r.reference].filter(Boolean).join(" · ")}
                            </span>
                          )}
                        </td>
                        <td className="text-muted">{t.invoices.methods[r.method]}</td>
                        <td className="num text-end font-medium">{money(r.amountFils)}</td>
                        <td>
                          <span className="flex justify-end gap-1">
                            <Link href={`/${lang}/finance/expenses/${r.id}?back=${encodeURIComponent(here)}`} className="btn-ghost min-h-8 px-2 text-xs">
                              {t.common.edit}
                            </Link>
                            <RowDelete action={deleteExpense} hidden={{ lang, id: r.id }} labels={{ delete: X.delete, confirm: X.deleteConfirm, cancel: t.common.cancel, saving: t.common.saving }} />
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
        <aside className="grid min-w-0 content-start gap-6 [&>*]:min-w-0">
          <section className="card card-pad">
            <h2 className="section-title mb-4">{X.add}</h2>
            <ExpenseForm lang={lang} t={t} categories={categories} today={today >= period.from && today <= period.to ? today : period.from} />
          </section>
          <section className="card card-pad">
            <h2 className="section-title mb-4">{X.byCategory}</h2>
            <ShareBars items={[...totals].map(([id, v]) => ({ label: name(id), value: v }))} money={money} empty={X.empty} />
          </section>
        </aside>
      </div>
    </>
  );
}
