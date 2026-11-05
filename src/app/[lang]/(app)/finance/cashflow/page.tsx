import { Suspense } from "react";
import { getDb } from "@/db";
import { formatDate, formatMoney } from "@/i18n";
import { pageContext } from "@/lib/page";
import { todayKuwait } from "@/lib/dates";
import { cashAt, financeReport, getFinanceSettings } from "@/lib/finance";
import { parsePeriod, previousPeriod } from "@/lib/period";
import { periodLabels, periodTitle, pickerYears } from "@/lib/finance-ui";
import { PageHeader, PageSkeleton } from "@/components/ui";
import { PrintButton } from "@/components/print-button";
import { PeriodPicker } from "@/components/finance/period-picker";
import { Statement, type Line } from "@/components/finance/statement";
import { monthLabel } from "@/components/hr/ui";

export default function CashflowPage(props: PageProps<"/[lang]/finance/cashflow">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Cashflow {...props} />
    </Suspense>
  );
}

async function Cashflow({ params, searchParams }: PageProps<"/[lang]/finance/cashflow">) {
  const { lang, t } = await pageContext(params, { admin: true });
  const C = t.finance.cashflow;
  const today = todayKuwait();
  const period = parsePeriod(await searchParams, today);
  const db = await getDb();
  const settings = await getFinanceSettings(db);
  // Cash is only tracked from the opening-balance date.
  const clamp = (d: string) => (d < settings.openingDate ? settings.openingDate : d);
  const prevRange = previousPeriod(period);
  const curFrom = clamp(period.from);
  const prevFrom = clamp(prevRange.from);
  const [cur, prev, opening, prevOpening, years] = await Promise.all([
    period.to >= curFrom ? financeReport(db, curFrom, period.to) : null,
    prevRange.to >= prevFrom ? financeReport(db, prevFrom, prevRange.to) : null,
    cashAt(db, curFrom),
    cashAt(db, prevFrom),
    pickerYears(db, +today.slice(0, 4)),
  ]);
  const money = (f: number) => formatMoney(Math.round(f), lang);
  const c = cur?.total.cash;
  const p = prev?.total.cash;
  const z = 0;
  const methods = (["cash", "knet", "card", "transfer"] as const).filter((m) => c?.fromCustomers[m] || p?.fromCustomers[m]);

  const lines: Line[] = [
    { label: C.opening, value: opening, previous: prevOpening, kind: "total" },
    { label: C.operating, value: 0, kind: "section" },
    ...methods.map((m): Line => ({ label: `${C.fromCustomers} · ${t.invoices.methods[m]}`, value: c?.fromCustomers[m] ?? z, previous: p?.fromCustomers[m] ?? z, level: 1 })),
    ...(methods.length === 0 ? [{ label: C.fromCustomers, value: 0, previous: 0, level: 1 } as Line] : []),
    ...(c?.otherIncome || p?.otherIncome ? [{ label: C.otherIncome, value: c?.otherIncome ?? z, previous: p?.otherIncome ?? z, level: 1 } as Line] : []),
    { label: C.paidExpenses, value: c?.expenses ?? z, previous: p?.expenses ?? z, level: 1, negative: true, costLike: true },
    { label: C.paidSuppliers, value: c?.suppliers ?? z, previous: p?.suppliers ?? z, level: 1, negative: true, costLike: true },
    { label: C.paidSalaries, value: c?.salaries ?? z, previous: p?.salaries ?? z, level: 1, negative: true, costLike: true },
    ...(c?.pifss || p?.pifss ? [{ label: C.paidPifss, value: c?.pifss ?? z, previous: p?.pifss ?? z, level: 1, negative: true, costLike: true } as Line] : []),
    { label: C.netOperating, value: c?.operating ?? z, previous: p?.operating ?? z, kind: "total" },
    { label: C.investing, value: 0, kind: "section" },
    { label: C.equipment, value: c?.equipment ?? z, previous: p?.equipment ?? z, level: 1, negative: true, costLike: true },
    ...(c?.depositsOut || p?.depositsOut ? [{ label: C.depositsOut, value: c?.depositsOut ?? z, previous: p?.depositsOut ?? z, level: 1, negative: true, costLike: true } as Line] : []),
    ...(c?.depositsIn || p?.depositsIn ? [{ label: C.depositsIn, value: c?.depositsIn ?? z, previous: p?.depositsIn ?? z, level: 1 } as Line] : []),
    { label: C.netInvesting, value: c?.investing ?? z, previous: p?.investing ?? z, kind: "total" },
    { label: C.financing, value: 0, kind: "section" },
    { label: C.capitalIn, value: c?.capitalIn ?? z, previous: p?.capitalIn ?? z, level: 1 },
    { label: C.loansIn, value: c?.loansIn ?? z, previous: p?.loansIn ?? z, level: 1 },
    { label: C.drawings, value: c?.drawings ?? z, previous: p?.drawings ?? z, level: 1, negative: true, costLike: true },
    { label: C.loansOut, value: c?.loansOut ?? z, previous: p?.loansOut ?? z, level: 1, negative: true, costLike: true },
    { label: C.netFinancing, value: c?.financing ?? z, previous: p?.financing ?? z, kind: "total" },
    { label: C.netChange, value: c?.net ?? z, previous: p?.net ?? z, kind: "total" },
    { label: C.closing, value: opening + (c?.net ?? 0), previous: prevOpening + (p?.net ?? 0), kind: "grand" },
  ];

  return (
    <>
      <PageHeader title={`${C.title} · ${periodTitle(period, lang)}`} subtitle={C.subtitle} actions={<PrintButton label={t.common.print} />} />
      <PeriodPicker lang={lang} {...period} years={years} labels={periodLabels(t)} />
      {period.from < settings.openingDate && (
        <p role="note" className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {C.beforeOpening.replace("{date}", formatDate(settings.openingDate, lang))}
        </p>
      )}
      <section className="card">
        <Statement lines={lines} money={money} headings={{ item: "", current: periodTitle(period, lang), previous: t.finance.period.previous, change: t.finance.period.change }} />
      </section>

      {cur && cur.months.length > 1 && (
        <section className="card mt-6">
          <h2 className="section-title border-b border-line px-4 py-3.5 sm:px-6">{C.monthly}</h2>
          <div className="table-wrap">
            <table className="table min-w-[36rem]">
              <thead>
                <tr>
                  <th>{t.hr.payroll.period}</th>
                  <th className="text-end">{C.in}</th>
                  <th className="text-end">{C.out}</th>
                  <th className="text-end">{C.net}</th>
                  <th className="text-end">{C.closing}</th>
                </tr>
              </thead>
              <tbody>
                {cur.months.reduce<{ rows: React.ReactNode[]; bal: number }>(
                  (acc, m) => {
                    const bal = acc.bal + m.figures.cash.net;
                    acc.rows.push(
                      <tr key={m.key}>
                        <td>{monthLabel(+m.key.slice(0, 4), +m.key.slice(5, 7), lang)}</td>
                        <td className="num text-end">{money(m.figures.cash.in)}</td>
                        <td className="num text-end">−{money(m.figures.cash.out)}</td>
                        <td className={`num text-end font-medium ${m.figures.cash.net < 0 ? "text-red-700" : ""}`}>
                          {m.figures.cash.net < 0 ? `−${money(-m.figures.cash.net)}` : money(m.figures.cash.net)}
                        </td>
                        <td className="num text-end">{bal < 0 ? `−${money(-bal)}` : money(bal)}</td>
                      </tr>,
                    );
                    return { rows: acc.rows, bal };
                  },
                  { rows: [], bal: opening },
                ).rows}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </>
  );
}
