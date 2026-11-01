import { Suspense } from "react";
import Link from "next/link";
import { desc, eq, sql } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { formatMoney, formatNumber } from "@/i18n";
import { pageContext } from "@/lib/page";
import { todayKuwait } from "@/lib/dates";
import { startPayroll } from "@/lib/actions/hr";
import { ActionForm, SubmitButton } from "@/components/forms";
import { EmptyState, PageHeader, PageSkeleton } from "@/components/ui";
import { PayrollStatusBadge, monthLabel } from "@/components/hr/ui";

export default function PayrollPage(props: PageProps<"/[lang]/hr/payroll">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Payroll {...props} />
    </Suspense>
  );
}

async function Payroll({ params }: PageProps<"/[lang]/hr/payroll">) {
  const { lang, t } = await pageContext(params, { admin: true });
  const P = t.hr.payroll;
  const db = await getDb();
  const runs = await db
    .select({
      id: schema.payrollRuns.id,
      year: schema.payrollRuns.year,
      month: schema.payrollRuns.month,
      status: schema.payrollRuns.status,
      employees: sql<number>`count(${schema.payslips.id})::int`,
      gross: sql<number>`coalesce(sum(${schema.payslips.grossFils}), 0)::int`,
      net: sql<number>`coalesce(sum(${schema.payslips.netFils}), 0)::int`,
      employer: sql<number>`coalesce(sum(${schema.payslips.pifssEmployerFils}), 0)::int`,
    })
    .from(schema.payrollRuns)
    .leftJoin(schema.payslips, eq(schema.payslips.runId, schema.payrollRuns.id))
    .groupBy(schema.payrollRuns.id)
    .orderBy(desc(schema.payrollRuns.year), desc(schema.payrollRuns.month));
  const thisMonth = todayKuwait().slice(0, 7);

  return (
    <>
      <PageHeader title={P.title} />
      <div className="grid gap-6 lg:grid-cols-3">
        <section className="card min-w-0 lg:col-span-2">
          <h2 className="section-title border-b border-line px-4 py-3.5 sm:px-6">{P.runs}</h2>
          {runs.length === 0 ? (
            <EmptyState icon="revenue" message={P.empty} />
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>{P.period}</th>
                    <th className="text-end">{P.employees}</th>
                    <th className="text-end">{P.gross}</th>
                    <th className="text-end">{P.net}</th>
                    <th className="text-end">{P.totalCost}</th>
                    <th>{t.common.status}</th>
                  </tr>
                </thead>
                <tbody>
                  {runs.map((r) => (
                    <tr key={r.id}>
                      <td>
                        <Link href={`/${lang}/hr/payroll/${r.id}`} className="link">
                          {monthLabel(r.year, r.month, lang)}
                        </Link>
                      </td>
                      <td className="num text-end">{formatNumber(r.employees, lang)}</td>
                      <td className="num text-end">{formatMoney(r.gross, lang)}</td>
                      <td className="num text-end font-medium">{formatMoney(r.net, lang)}</td>
                      <td className="num text-end">{formatMoney(r.gross + r.employer, lang)}</td>
                      <td>
                        <PayrollStatusBadge status={r.status} t={t} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
        <section className="card card-pad content-start">
          <h2 className="section-title mb-4">{P.start}</h2>
          <ActionForm action={startPayroll} hidden={{ lang }} className="space-y-4">
            <div>
              <label htmlFor="f-period" className="label">
                {P.period}
              </label>
              <input id="f-period" name="period" type="month" required defaultValue={thisMonth} className="input" />
            </div>
            <SubmitButton className="btn-primary w-full" pendingLabel={t.common.saving}>
              {P.start}
            </SubmitButton>
          </ActionForm>
        </section>
      </div>
    </>
  );
}
