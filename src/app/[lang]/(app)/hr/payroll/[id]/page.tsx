import { Suspense } from "react";
import { asc, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { getDb, schema } from "@/db";
import { formatDate, formatMoney, formatNumber } from "@/i18n";
import { pageContext } from "@/lib/page";
import { UUID_RE } from "@/lib/actions/helpers";
import { PageHeader, PageSkeleton, Stat } from "@/components/ui";
import { PrintButton } from "@/components/print-button";
import { PayrollStatusBadge, fromCenti, monthLabel } from "@/components/hr/ui";
import { PayslipRow } from "@/components/hr/payslip-row";
import { RunActions } from "@/components/hr/run-actions";
import { can } from "@/lib/auth";

export default function PayrollRunPage(props: PageProps<"/[lang]/hr/payroll/[id]">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Run {...props} />
    </Suspense>
  );
}

async function Run({ params }: PageProps<"/[lang]/hr/payroll/[id]">) {
  const { lang, t, user } = await pageContext(params, { perm: "hr.view" });
  const canManage = can(user, "hr.manage");
  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();
  const db = await getDb();
  const [run] = await db.select().from(schema.payrollRuns).where(eq(schema.payrollRuns.id, id)).limit(1);
  if (!run) notFound();
  const slips = await db.select().from(schema.payslips).where(eq(schema.payslips.runId, id)).orderBy(asc(schema.payslips.employeeName));
  const P = t.hr.payroll;
  const money = (f: number) => formatMoney(f, lang);
  const sum = (k: keyof (typeof slips)[number]) => slips.reduce((a, p) => a + (p[k] as number), 0);
  const gross = sum("grossFils");
  const net = sum("netFils");
  const employer = sum("pifssEmployerFils");
  const editable = run.status === "draft";

  return (
    <>
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-3">
            {P.title} · {monthLabel(run.year, run.month, lang)}
            <PayrollStatusBadge status={run.status} t={t} />
          </span>
        }
        subtitle={run.paidAt ? P.paidOn.replace("{date}", formatDate(run.paidAt, lang)) : editable ? P.recalcHint : P.lockedHint}
        back={{ href: `/${lang}/hr/payroll`, label: P.runs }}
        actions={
          <>
            {canManage && (
              <RunActions
                lang={lang}
                id={run.id}
                status={run.status}
                labels={{
                  recalc: P.recalc,
                  approve: P.approve,
                  reopen: P.reopen,
                  markPaid: P.markPaid,
                  delete: P.delete,
                  deleteConfirm: P.deleteConfirm,
                  cancel: t.common.cancel,
                  saving: t.common.saving,
                }}
              />
            )}
            {run.status !== "draft" && canManage && (
              <a href={`/api/hr/payroll/${run.id}/bank`} className="btn-secondary" download>
                {P.bankFile}
              </a>
            )}
            <PrintButton label={P.print} />
          </>
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Stat label={P.employees} value={formatNumber(slips.length, lang)} />
        <Stat label={P.gross} value={money(gross)} />
        <Stat label={P.net} value={money(net)} />
        <Stat label={`${P.totalCost} (${P.employerCost})`} value={money(gross + employer)} />
      </div>

      <div className="card">
        <div className="table-wrap">
          <table className="table min-w-[52rem]">
            <thead>
              <tr>
                <th>{P.employees}</th>
                <th className="text-end">
                  {P.basic} + {P.allowances}
                </th>
                <th className="text-end">{P.extras}</th>
                <th className="text-end">{P.deductions}</th>
                <th className="text-end">{P.pifssEmployee}</th>
                <th className="text-end">{P.net}</th>
                <th>
                  <span className="sr-only">{t.common.actions}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {slips.map((p) => (
                <PayslipRow
                  key={p.id}
                  lang={lang}
                  href={`/${lang}/hr/payroll/${run.id}/slip/${p.id}`}
                  editable={editable && canManage}
                  slip={{
                    id: p.id,
                    name: p.employeeName,
                    daysEmployed: p.daysEmployed,
                    daysInMonth: p.daysInMonth,
                    otNormal: p.overtimeNormalCentiHours ? fromCenti(p.overtimeNormalCentiHours) : "",
                    otRest: p.overtimeRestCentiHours ? fromCenti(p.overtimeRestCentiHours) : "",
                    otHoliday: p.overtimeHolidayCentiHours ? fromCenti(p.overtimeHolidayCentiHours) : "",
                    bonus: p.bonusFils ? (p.bonusFils / 1000).toFixed(3) : "",
                    absence: p.absenceDays ? String(p.absenceDays) : "",
                    otherDeduction: p.otherDeductionFils ? (p.otherDeductionFils / 1000).toFixed(3) : "",
                    note: p.note ?? "",
                    negative: p.netFils < 0,
                  }}
                  cells={{
                    earnings: money(p.basicFils + p.housingFils + p.transportFils + p.otherAllowanceFils),
                    extras: p.overtimeFils + p.bonusFils ? money(p.overtimeFils + p.bonusFils) : "—",
                    deductions: p.unpaidLeaveFils + p.absenceFils + p.otherDeductionFils ? `−${money(p.unpaidLeaveFils + p.absenceFils + p.otherDeductionFils)}` : "—",
                    pifss: p.pifssEmployeeFils ? `−${money(p.pifssEmployeeFils)}` : "—",
                    net: money(p.netFils),
                  }}
                  labels={{
                    adjust: P.adjust,
                    payslip: P.viewPayslip,
                    overtimeNormal: P.overtimeNormal,
                    overtimeRest: P.overtimeRest,
                    overtimeHoliday: P.overtimeHoliday,
                    bonus: P.bonus,
                    absence: P.absence,
                    otherDeduction: P.otherDeduction,
                    note: P.note,
                    save: t.common.save,
                    saving: t.common.saving,
                    cancel: t.common.cancel,
                    negativeNet: P.negativeNet,
                    prorated: P.prorated,
                  }}
                />
              ))}
            </tbody>
            <tfoot>
              <tr className="font-semibold">
                <td className="px-4 py-3">{t.common.total}</td>
                <td className="num px-4 py-3 text-end">{money(sum("basicFils") + sum("housingFils") + sum("transportFils") + sum("otherAllowanceFils"))}</td>
                <td className="num px-4 py-3 text-end">{money(sum("overtimeFils") + sum("bonusFils"))}</td>
                <td className="num px-4 py-3 text-end">−{money(sum("unpaidLeaveFils") + sum("absenceFils") + sum("otherDeductionFils"))}</td>
                <td className="num px-4 py-3 text-end">−{money(sum("pifssEmployeeFils"))}</td>
                <td className="num px-4 py-3 text-end">{money(net)}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
      {employer > 0 && (
        <p className="mt-3 text-sm text-muted">
          {P.pifssEmployer}: <span className="num font-medium text-ink">{money(employer)}</span> · {P.employerCopy}
        </p>
      )}
    </>
  );
}
