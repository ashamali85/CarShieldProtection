import { Suspense } from "react";
import { getDb } from "@/db";
import { formatMoney } from "@/i18n";
import { pageContext } from "@/lib/page";
import { todayKuwait } from "@/lib/dates";
import { financeReport } from "@/lib/finance";
import { parsePeriod, previousPeriod } from "@/lib/period";
import { periodLabels, periodTitle, pickerYears } from "@/lib/finance-ui";
import { PageHeader, PageSkeleton } from "@/components/ui";
import { PrintButton } from "@/components/print-button";
import { PeriodPicker } from "@/components/finance/period-picker";
import { Statement } from "@/components/finance/statement";
import { pnlLines } from "@/lib/finance-lines";

export default function PnlPage(props: PageProps<"/[lang]/finance/pnl">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Pnl {...props} />
    </Suspense>
  );
}

async function Pnl({ params, searchParams }: PageProps<"/[lang]/finance/pnl">) {
  const { lang, t } = await pageContext(params, { admin: true });
  const P = t.finance.pnl;
  const today = todayKuwait();
  const period = parsePeriod(await searchParams, today);
  const prevRange = previousPeriod(period);
  const db = await getDb();
  const [report, prev, years] = await Promise.all([
    financeReport(db, period.from, period.to),
    financeReport(db, prevRange.from, prevRange.to),
    pickerYears(db, +today.slice(0, 4)),
  ]);
  const money = (f: number) => formatMoney(Math.round(f), lang);

  return (
    <>
      <PageHeader title={`${P.title} · ${periodTitle(period, lang)}`} subtitle={P.subtitle} actions={<PrintButton label={t.common.print} />} />
      <PeriodPicker lang={lang} {...period} years={years} labels={periodLabels(t)} />
      {report.uncostedItems > 0 && (
        <p role="note" className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {P.missingCost.replace("{n}", String(report.uncostedItems))}
        </p>
      )}
      <section className="card">
        <Statement
          lines={pnlLines(report.total, prev.total, report, t, lang)}
          money={money}
          headings={{ item: "", current: periodTitle(period, lang), previous: t.finance.period.previous, change: t.finance.period.change }}
        />
      </section>
      <details className="mt-4 text-sm text-muted">
        <summary className="cursor-pointer font-medium text-ink">{P.notes}</summary>
        <ul className="mt-2 list-disc space-y-1 ps-5">
          <li>{P.note1}</li>
          <li>{P.note2}</li>
          <li>{P.note3}</li>
          <li>{P.note4}</li>
          <li>{P.note5}</li>
        </ul>
      </details>
    </>
  );
}
