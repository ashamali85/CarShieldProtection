import { Suspense } from "react";
import Link from "next/link";
import { getDb } from "@/db";
import { formatMoney } from "@/i18n";
import { pageContext } from "@/lib/page";
import { todayKuwait } from "@/lib/dates";
import { addDaysIso } from "@/lib/hr";
import { cashAt, financeReport, receivables } from "@/lib/finance";
import { parsePeriod, periodQuery, previousPeriod } from "@/lib/period";
import { periodLabels, periodTitle, pickerYears } from "@/lib/finance-ui";
import { pct } from "@/lib/finance-lines";
import { PageHeader, PageSkeleton } from "@/components/ui";
import { PeriodPicker } from "@/components/finance/period-picker";
import { MonthChart, ShareBars } from "@/components/finance/month-chart";
import { monthLabel } from "@/components/hr/ui";

export default function FinanceDashboardPage(props: PageProps<"/[lang]/finance">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Dashboard {...props} />
    </Suspense>
  );
}

function Kpi({ label, value, change, good, hint, tone }: { label: string; value: string; change?: string; good?: boolean | null; hint?: string; tone?: "neg" }) {
  return (
    <div className="card p-4 sm:p-5">
      <p className="text-sm text-muted">{label}</p>
      <p className={`num mt-1 text-2xl leading-tight font-semibold tracking-tight [overflow-wrap:anywhere] whitespace-normal ${tone === "neg" ? "text-red-700" : "text-ink"}`}>{value}</p>
      {change && <p className={`num mt-1 text-xs ${good == null ? "text-muted" : good ? "text-emerald-700" : "text-red-700"}`}>{change}</p>}
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </div>
  );
}

async function Dashboard({ params, searchParams }: PageProps<"/[lang]/finance">) {
  const { lang, t } = await pageContext(params, { admin: true });
  const D = t.finance.dashboard;
  const today = todayKuwait();
  const period = parsePeriod(await searchParams, today);
  const prevRange = previousPeriod(period);
  const db = await getDb();
  const yearFrom = `${period.year}-01-01`;
  const yearTo = `${period.year}-12-31`;
  const [cur, prev, year, cashNow, owed, years] = await Promise.all([
    financeReport(db, period.from, period.to),
    financeReport(db, prevRange.from, prevRange.to),
    financeReport(db, yearFrom, yearTo),
    cashAt(db, addDaysIso(today, 1)),
    receivables(db),
    pickerYears(db, +today.slice(0, 4)),
  ]);
  const money = (f: number) => formatMoney(Math.round(f), lang);
  const signed = (f: number) => (f < 0 ? `−${money(-f)}` : money(f));
  const c = cur.total;
  const p = prev.total;
  const change = (now: number, before: number, costLike = false) => {
    if (now === before) return { change: undefined, good: null };
    const d = now - before;
    return { change: `${d > 0 ? "▲" : "▼"} ${money(Math.abs(d))} ${D.vsPrevious}`, good: costLike ? d < 0 : d > 0 };
  };
  const q = periodQuery(period);
  const catName = (code: string) => {
    const x = cur.categories.find((k) => k.code === code);
    return x ? (lang === "ar" ? x.nameAr : x.nameEn) : code;
  };
  const expenseMix = [
    { label: t.finance.pnl.materials, value: c.materials },
    { label: t.finance.pnl.payroll, value: c.payrollFixed + c.payrollExtra + c.employerPifss },
    ...Object.entries(c.opexByCategory).map(([code, v]) => ({ label: catName(code), value: v })),
    { label: t.finance.pnl.stockLoss, value: c.stockLoss },
  ];
  const revenueMix = (["ppf", "ceramic", "tint", "detailing", "other"] as const).map((k) => ({ label: t.services.categories[k], value: c.revenueByCategory[k] }));
  const short = (key: string) =>
    new Intl.DateTimeFormat(lang === "ar" ? "ar-KW-u-nu-latn" : "en-GB", { month: "short", timeZone: "UTC" }).format(Date.UTC(+key.slice(0, 4), +key.slice(5, 7) - 1, 1));

  return (
    <>
      <PageHeader title={`${t.finance.title} · ${periodTitle(period, lang)}`} subtitle={D.subtitle} />
      <PeriodPicker lang={lang} {...period} years={years} labels={periodLabels(t)} />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi label={D.revenue} value={money(c.netRevenue)} {...change(c.netRevenue, p.netRevenue)} />
        <Kpi label={D.grossProfit} value={signed(c.grossProfit)} {...change(c.grossProfit, p.grossProfit)} hint={`${t.finance.pnl.grossMargin}: ${pct(c.grossProfit, c.netRevenue)}`} />
        <Kpi label={D.expenses} value={money(c.totalOpex)} {...change(c.totalOpex, p.totalOpex, true)} />
        <Kpi
          label={c.netProfit < 0 ? D.netLoss : D.netProfit}
          value={signed(c.netProfit)}
          tone={c.netProfit < 0 ? "neg" : undefined}
          {...change(c.netProfit, p.netProfit)}
          hint={`${D.margin}: ${pct(c.netProfit, c.netRevenue)}`}
        />
        <Kpi label={D.cashIn} value={money(c.cash.in)} {...change(c.cash.in, p.cash.in)} />
        <Kpi label={D.cashOut} value={money(c.cash.out)} {...change(c.cash.out, p.cash.out, true)} />
        <Kpi label={D.cashBalance} value={signed(cashNow)} tone={cashNow < 0 ? "neg" : undefined} hint={new Intl.DateTimeFormat(lang === "ar" ? "ar-KW-u-nu-latn" : "en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kuwait" }).format(new Date())} />
        <Kpi label={D.receivables} value={money(owed)} hint={D.receivablesHint} />
      </div>
      <p className="mt-2 flex flex-wrap justify-end gap-4 text-sm">
        <Link href={`/${lang}/finance/pnl${q}`} className="link">
          {D.viewPnl} →
        </Link>
        <Link href={`/${lang}/finance/cashflow${q}`} className="link">
          {D.viewCash} →
        </Link>
      </p>

      <div className="mt-4 grid gap-6 lg:grid-cols-3">
        <section className="card card-pad min-w-0 lg:col-span-2">
          <h2 className="section-title mb-4">
            {D.byMonth} · {period.year}
          </h2>
          <MonthChart
            data={year.months.map((m) => ({ label: short(m.key), revenue: m.figures.netRevenue, costs: m.figures.materials + m.figures.totalOpex, profit: m.figures.netProfit }))}
            labels={{ revenue: D.revenue, costs: `${t.finance.pnl.cogs} + ${D.expenses}`, profit: D.netProfit }}
          />
        </section>
        <div className="grid min-w-0 content-start gap-6 [&>*]:min-w-0">
          <section className="card card-pad">
            <h2 className="section-title mb-4">{D.revenueMix}</h2>
            <ShareBars items={revenueMix} money={money} empty={D.noData} />
          </section>
          <section className="card card-pad">
            <h2 className="section-title mb-4">{D.expenseMix}</h2>
            <ShareBars items={expenseMix} money={money} empty={D.noData} />
          </section>
        </div>
      </div>

      <section className="card mt-6">
        <h2 className="section-title border-b border-line px-4 py-3.5 sm:px-6">
          {D.byMonth} · {period.year}
        </h2>
        <div className="table-wrap">
          <table className="table min-w-[48rem]">
            <thead>
              <tr>
                <th>{t.hr.payroll.period}</th>
                <th className="text-end">{D.revenue}</th>
                <th className="text-end">{D.grossProfit}</th>
                <th className="text-end">{D.expenses}</th>
                <th className="text-end">{D.netProfit}</th>
                <th className="text-end">{t.finance.cashflow.net}</th>
              </tr>
            </thead>
            <tbody>
              {year.months.map((m) => (
                <tr key={m.key}>
                  <td>
                    <Link href={`/${lang}/finance?p=month&y=${m.key.slice(0, 4)}&m=${+m.key.slice(5, 7)}`} className="link">
                      {monthLabel(+m.key.slice(0, 4), +m.key.slice(5, 7), lang)}
                    </Link>
                  </td>
                  <td className="num text-end">{money(m.figures.netRevenue)}</td>
                  <td className="num text-end">{signed(m.figures.grossProfit)}</td>
                  <td className="num text-end">{money(m.figures.totalOpex)}</td>
                  <td className={`num text-end font-medium ${m.figures.netProfit < 0 ? "text-red-700" : ""}`}>{signed(m.figures.netProfit)}</td>
                  <td className={`num text-end ${m.figures.cash.net < 0 ? "text-red-700" : ""}`}>{signed(m.figures.cash.net)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="font-semibold">
                <td className="px-4 py-3">{t.common.total}</td>
                <td className="num px-4 py-3 text-end">{money(year.total.netRevenue)}</td>
                <td className="num px-4 py-3 text-end">{signed(year.total.grossProfit)}</td>
                <td className="num px-4 py-3 text-end">{money(year.total.totalOpex)}</td>
                <td className={`num px-4 py-3 text-end ${year.total.netProfit < 0 ? "text-red-700" : ""}`}>{signed(year.total.netProfit)}</td>
                <td className="num px-4 py-3 text-end">{signed(year.total.cash.net)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </section>
    </>
  );
}
