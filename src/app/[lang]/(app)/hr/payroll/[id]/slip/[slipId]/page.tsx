import { Suspense } from "react";
import { and, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { getDb, schema } from "@/db";
import { formatMoney } from "@/i18n";
import { pageContext } from "@/lib/page";
import { UUID_RE } from "@/lib/actions/helpers";
import { PageHeader, PageSkeleton } from "@/components/ui";
import { PrintButton } from "@/components/print-button";
import { BrandMark } from "@/components/logo";
import { PayrollStatusBadge, fromCenti, monthLabel } from "@/components/hr/ui";

export default function PayslipPage(props: PageProps<"/[lang]/hr/payroll/[id]/slip/[slipId]">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Payslip {...props} />
    </Suspense>
  );
}

function Lines({ title, items, total, totalLabel, money, sign = "" }: { title: string; items: [string, number][]; total: number; totalLabel: string; money: (f: number) => string; sign?: string }) {
  return (
    <section>
      <h2 className="mb-2 text-sm font-semibold tracking-wide text-muted uppercase">{title}</h2>
      <dl className="divide-y divide-line text-sm">
        {items.map(([label, v]) => (
          <div key={label} className="flex justify-between gap-3 py-2">
            <dt>{label}</dt>
            <dd className="num">
              {v ? sign : ""}
              {money(v)}
            </dd>
          </div>
        ))}
        {items.length === 0 && <div className="py-2 text-muted">—</div>}
        <div className="flex justify-between gap-3 py-2 font-semibold">
          <dt>{totalLabel}</dt>
          <dd className="num">
            {total ? sign : ""}
            {money(total)}
          </dd>
        </div>
      </dl>
    </section>
  );
}

async function Payslip({ params }: PageProps<"/[lang]/hr/payroll/[id]/slip/[slipId]">) {
  const { lang, t } = await pageContext(params, { admin: true });
  const { id, slipId } = await params;
  if (!UUID_RE.test(id) || !UUID_RE.test(slipId)) notFound();
  const db = await getDb();
  const [row] = await db
    .select({ p: schema.payslips, run: schema.payrollRuns, code: schema.employees.code, nameAr: schema.employees.fullNameAr, civilId: schema.employees.civilId })
    .from(schema.payslips)
    .innerJoin(schema.payrollRuns, eq(schema.payslips.runId, schema.payrollRuns.id))
    .innerJoin(schema.employees, eq(schema.payslips.employeeId, schema.employees.id))
    .where(and(eq(schema.payslips.id, slipId), eq(schema.payslips.runId, id)))
    .limit(1);
  if (!row) notFound();
  const { p, run } = row;
  const P = t.hr.payroll;
  const E = t.hr.employees;
  const money = (f: number) => formatMoney(f, lang);
  const period = monthLabel(run.year, run.month, lang);

  const earnings: [string, number][] = (
    [
      [E.basic, p.basicFils],
      [E.housing, p.housingFils],
      [E.transport, p.transportFils],
      [E.otherAllowance, p.otherAllowanceFils],
    ] as [string, number][]
  ).filter(([label, v], i) => i === 0 || v !== 0 || !label);
  if (p.overtimeFils) {
    const hrs = [p.overtimeNormalCentiHours, p.overtimeRestCentiHours, p.overtimeHolidayCentiHours].filter(Boolean).map(fromCenti).join(" + ");
    earnings.push([`${P.overtime} (${hrs} h)`, p.overtimeFils]);
  }
  if (p.bonusFils) earnings.push([P.bonus, p.bonusFils]);
  const deductions: [string, number][] = [];
  if (p.unpaidLeaveFils) deductions.push([`${P.unpaidLeave} (${fromCenti(p.unpaidLeaveCentiDays)} d)`, p.unpaidLeaveFils]);
  if (p.absenceFils) deductions.push([`${P.absence.split(" (")[0]} (${p.absenceDays} d)`, p.absenceFils]);
  if (p.pifssEmployeeFils) deductions.push([P.pifssEmployee, p.pifssEmployeeFils]);
  if (p.otherDeductionFils) deductions.push([P.otherDeduction.split(" (")[0], p.otherDeductionFils]);

  return (
    <>
      <PageHeader
        title={`${P.payslip} · ${period}`}
        back={{ href: `/${lang}/hr/payroll/${run.id}`, label: `${P.title} · ${period}` }}
        actions={<PrintButton label={t.common.print} />}
      />
      <article className="card card-pad max-w-3xl print:max-w-none">
        <header className="mb-6 flex flex-wrap items-start justify-between gap-4 border-b border-line pb-5">
          <div className="flex items-center gap-3">
            <BrandMark className="size-12" />
            <div>
              <p className="font-semibold">{t.app.name}</p>
              <p className="text-sm text-muted">
                {P.payslip} · {period}
              </p>
            </div>
          </div>
          <PayrollStatusBadge status={run.status} t={t} />
        </header>
        <dl className="mb-6 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-xs text-muted">{t.users.name}</dt>
            <dd className="font-medium">
              <span className="auto-dir" dir="auto">
                {p.employeeName}
              </span>
              {row.nameAr && (
                <span className="block text-muted" dir="rtl" lang="ar">
                  {row.nameAr}
                </span>
              )}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted">{E.jobTitle}</dt>
            <dd>{p.jobTitle}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted">{E.code}</dt>
            <dd className="num">#{row.code}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted">{E.civilId}</dt>
            <dd className="num" dir="ltr">
              <span className="block text-start">{row.civilId ?? "—"}</span>
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted">{P.days}</dt>
            <dd className="num">
              {p.daysEmployed} / {p.daysInMonth}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted">{E.iban}</dt>
            <dd className="num break-all text-xs" dir="ltr">
              <span className="block text-start">{p.iban ?? "—"}</span>
            </dd>
          </div>
        </dl>
        <div className="grid gap-8 sm:grid-cols-2">
          <Lines title={P.earnings} items={earnings} total={p.grossFils} totalLabel={t.common.total} money={money} />
          <Lines title={P.deductionsTitle} items={deductions} total={p.deductionsFils} totalLabel={t.common.total} money={money} sign="−" />
        </div>
        <div className="mt-6 flex items-center justify-between rounded-xl bg-brand-50 px-4 py-3">
          <span className="font-semibold">{P.net}</span>
          <span className="num text-xl font-bold text-brand-800">{money(p.netFils)}</span>
        </div>
        {p.pifssEmployerFils > 0 && (
          <p className="mt-3 text-xs text-muted">
            {P.pifssEmployer}: <span className="num">{money(p.pifssEmployerFils)}</span> · {P.employerCopy}
          </p>
        )}
        {p.note && <p className="mt-4 rounded-lg border border-line px-3 py-2 text-sm">{p.note}</p>}
      </article>
    </>
  );
}
