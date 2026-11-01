import { Suspense } from "react";
import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { getDb, schema } from "@/db";
import { formatDate, formatMoney, formatNumber, type Dictionary, type Locale } from "@/i18n";
import { pageContext } from "@/lib/page";
import { todayKuwait } from "@/lib/dates";
import { UUID_RE } from "@/lib/actions/helpers";
import { getHrSettings, leaveBalances } from "@/lib/hr-data";
import { calendarDays, completeMonths, dailyRate, indemnity, monthlyWage, pifss } from "@/lib/hr";
import { reinstateEmployee } from "@/lib/actions/hr";
import { DefinitionList, EmptyState, PageHeader, PageSkeleton } from "@/components/ui";
import { SubmitButton } from "@/components/forms";
import { EmployeeStatusBadge, LeaveStatusBadge, PayBreakdown, monthLabel } from "@/components/hr/ui";
import { LeaveActions } from "@/components/hr/leave-actions";
import { EndServiceForm } from "@/components/hr/end-service";

export default function EmployeePage(props: PageProps<"/[lang]/hr/employees/[id]">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Employee {...props} />
    </Suspense>
  );
}

function DocDue({ date, lang, t, today }: { date: string | null; lang: Locale; t: Dictionary; today: string }) {
  if (!date) return <span className="text-muted">—</span>;
  const days = date >= today ? calendarDays(today, date) - 1 : -1;
  const tone = days < 0 ? "bg-red-100 text-red-700" : days <= 60 ? "bg-amber-100 text-amber-800" : "";
  return (
    <span className="num">
      {formatDate(date, lang)}
      {tone && (
        <span className={`badge ms-2 ${tone}`}>{days < 0 ? t.hr.overview.expired : t.hr.overview.inDays.replace("{n}", String(days))}</span>
      )}
    </span>
  );
}

async function Employee({ params }: PageProps<"/[lang]/hr/employees/[id]">) {
  const { lang, t } = await pageContext(params, { admin: true });
  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();
  const db = await getDb();
  const [emp] = await db.select().from(schema.employees).where(eq(schema.employees.id, id)).limit(1);
  if (!emp) notFound();
  const E = t.hr.employees;
  const L = t.hr.leave;
  const X = t.hr.separation;
  const P = t.hr.payroll;
  const today = todayKuwait();
  const asOf = emp.endDate ?? today;

  const [s, balances, leave, slips, [linked]] = await Promise.all([
    getHrSettings(db),
    leaveBalances(db, emp, asOf),
    db
      .select({ r: schema.leaveRequests, typeEn: schema.leaveTypes.nameEn, typeAr: schema.leaveTypes.nameAr })
      .from(schema.leaveRequests)
      .innerJoin(schema.leaveTypes, eq(schema.leaveRequests.leaveTypeId, schema.leaveTypes.id))
      .where(eq(schema.leaveRequests.employeeId, id))
      .orderBy(desc(schema.leaveRequests.startDate))
      .limit(50),
    db
      .select({ id: schema.payslips.id, runId: schema.payslips.runId, net: schema.payslips.netFils, year: schema.payrollRuns.year, month: schema.payrollRuns.month, status: schema.payrollRuns.status })
      .from(schema.payslips)
      .innerJoin(schema.payrollRuns, eq(schema.payslips.runId, schema.payrollRuns.id))
      .where(eq(schema.payslips.employeeId, id))
      .orderBy(desc(schema.payrollRuns.year), desc(schema.payrollRuns.month))
      .limit(24),
    emp.userId ? db.select({ name: schema.users.name }).from(schema.users).where(eq(schema.users.id, emp.userId)).limit(1) : Promise.resolve([]),
  ]);

  const wage = monthlyWage(emp);
  const months = completeMonths(emp.hireDate, asOf);
  const service = `${formatNumber(Math.floor(months / 12), lang)} ${E.years} ${formatNumber(months % 12, lang)} ${E.months}`;
  const contrib = emp.isKuwaiti ? pifss(emp.pifssSalaryFils ?? wage, s) : null;
  const annual = balances.find((b) => b.type.period === "accrual");
  const encash = Math.round(Math.max(0, annual?.available ?? 0) * dailyRate(wage, s));
  const ifTerminated = indemnity(wage, emp.hireDate, asOf, "termination", emp.contractType, s);
  const ifResigns = indemnity(wage, emp.hireDate, asOf, "resignation", emp.contractType, s);
  const actual = emp.status === "terminated" ? indemnity(wage, emp.hireDate, asOf, emp.separationReason, emp.contractType, s) : null;
  const typeName = (en: string, ar: string) => (lang === "ar" ? ar : en);
  const money = (f: number) => formatMoney(f, lang);

  return (
    <>
      <PageHeader
        title={
          <span className="auto-dir" dir="auto">
            {lang === "ar" && emp.fullNameAr ? emp.fullNameAr : emp.fullName}
          </span>
        }
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <span>
              {emp.jobTitle}
              {emp.department ? ` · ${emp.department}` : ""} · <span className="num">#{emp.code}</span>
            </span>
            <EmployeeStatusBadge status={emp.status} t={t} />
            {emp.endDate && <span>{X.ended.replace("{date}", formatDate(emp.endDate, lang))}</span>}
          </span>
        }
        back={{ href: `/${lang}/hr/employees`, label: E.title }}
        actions={
          <>
            {emp.status === "active" && (
              <Link href={`/${lang}/hr/leave/new?employee=${emp.id}`} className="btn-secondary">
                {L.record}
              </Link>
            )}
            <Link href={`/${lang}/hr/employees/${emp.id}/edit`} className="btn-primary">
              {t.common.edit}
            </Link>
          </>
        }
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="grid min-w-0 content-start gap-6 [&>*]:min-w-0 lg:col-span-2">
          <section className="card card-pad">
            <DefinitionList
              items={[
                { label: E.nationality, value: <>{emp.nationality}{emp.isKuwaiti && <span className="badge ms-2 bg-brand-50 text-brand-700">PIFSS</span>}</> },
                { label: E.gender, value: E.genders[emp.gender] },
                { label: E.hireDate, value: <span className="num">{formatDate(emp.hireDate, lang)}</span> },
                { label: E.serviceLength, value: <span className="num">{service}</span> },
                { label: E.contractType, value: <>{E.contractTypes[emp.contractType]}{emp.contractEnd && <span className="num text-muted"> · {formatDate(emp.contractEnd, lang)}</span>}</> },
                { label: E.civilId, value: <span className="num" dir="ltr">{emp.civilId ?? "—"}</span> },
                { label: E.phone, value: <span className="num" dir="ltr">{emp.phone ?? "—"}</span> },
                { label: E.email, value: <span dir="ltr">{emp.email ?? "—"}</span> },
                { label: E.linkedUser, value: linked?.name ?? E.noLinkedUser },
                ...(emp.notes ? [{ label: E.notes, value: <span className="whitespace-pre-line">{emp.notes}</span> }] : []),
              ]}
            />
          </section>

          <section className="card">
            <h2 className="section-title border-b border-line px-4 py-3.5 sm:px-6">{E.sections.salary}</h2>
            <div className="grid gap-6 p-4 sm:grid-cols-2 sm:p-6">
              <dl className="space-y-2 text-sm">
                {[
                  [E.basic, emp.basicSalaryFils],
                  [E.housing, emp.housingAllowanceFils],
                  [E.transport, emp.transportAllowanceFils],
                  [E.otherAllowance, emp.otherAllowanceFils],
                ].map(([label, v]) => (
                  <div key={label as string} className="flex justify-between gap-3">
                    <dt className="text-muted">{label}</dt>
                    <dd className="num">{money(v as number)}</dd>
                  </div>
                ))}
                <div className="flex justify-between gap-3 border-t border-line pt-2 font-semibold">
                  <dt>{E.wage}</dt>
                  <dd className="num">{money(wage)}</dd>
                </div>
              </dl>
              <dl className="space-y-2 text-sm">
                {contrib && (
                  <>
                    <div className="flex justify-between gap-3">
                      <dt className="text-muted">{E.pifssSalary}</dt>
                      <dd className="num">{money(emp.pifssSalaryFils ?? wage)}</dd>
                    </div>
                    <div className="flex justify-between gap-3">
                      <dt className="text-muted">{P.pifssEmployee}</dt>
                      <dd className="num">−{money(contrib.employee)}</dd>
                    </div>
                    <div className="flex justify-between gap-3">
                      <dt className="text-muted">{P.pifssEmployer}</dt>
                      <dd className="num">{money(contrib.employer)}</dd>
                    </div>
                  </>
                )}
                <div className="flex justify-between gap-3">
                  <dt className="text-muted">{E.bankName}</dt>
                  <dd>{emp.bankName ?? "—"}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-muted">{E.iban}</dt>
                  <dd className="num break-all text-end text-xs" dir="ltr">
                    {emp.iban ?? "—"}
                  </dd>
                </div>
              </dl>
            </div>
          </section>

          <section className="card">
            <h2 className="section-title flex items-center justify-between border-b border-line px-4 py-3.5 sm:px-6">{E.leaveBalances}</h2>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>{L.type}</th>
                    <th className="text-end">{L.allowance}</th>
                    <th className="text-end">{L.used}</th>
                    <th className="text-end">{L.available}</th>
                  </tr>
                </thead>
                <tbody>
                  {balances.map((b) => (
                    <tr key={b.type.id}>
                      <td>
                        {typeName(b.type.nameEn, b.type.nameAr)}
                        <span className="block text-xs text-muted">
                          {b.type.period === "accrual" ? L.accrual : b.type.period === "service" ? L.perService : b.type.period === "event" ? L.perEvent : L.perYear}
                          {!b.eligible && ` · ${L.eligibleAfter.replace("{n}", String(b.type.minServiceMonths))}`}
                        </span>
                      </td>
                      <td className="num text-end">{b.allowance === null ? L.noLimit : formatNumber(b.allowance, lang)}</td>
                      <td className="num text-end">{b.type.period === "event" ? "—" : formatNumber(b.used, lang)}</td>
                      <td className="num text-end font-semibold">{b.available === null ? "—" : formatNumber(b.available, lang)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="card">
            <h2 className="section-title border-b border-line px-4 py-3.5 sm:px-6">{E.leaveHistory}</h2>
            {leave.length === 0 ? (
              <EmptyState icon={null} message={L.empty} />
            ) : (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>{L.type}</th>
                      <th>{L.start}</th>
                      <th className="text-end">{L.days}</th>
                      <th>{L.pay}</th>
                      <th>{L.statusLabel}</th>
                      <th>
                        <span className="sr-only">{t.common.actions}</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {leave.map(({ r, typeEn, typeAr }) => (
                      <tr key={r.id}>
                        <td>
                          {typeName(typeEn, typeAr)}
                          {r.reason && <span className="block max-w-56 truncate text-xs text-muted">{r.reason}</span>}
                        </td>
                        <td className="num whitespace-nowrap">
                          {formatDate(r.startDate, lang)}
                          <span className="block text-xs text-muted">→ {formatDate(r.endDate, lang)}</span>
                        </td>
                        <td className="num text-end">{r.days}</td>
                        <td className="text-xs">
                          <PayBreakdown breakdown={r.payBreakdown} t={t} />
                        </td>
                        <td>
                          <LeaveStatusBadge status={r.status} t={t} />
                        </td>
                        <td>
                          <LeaveActions lang={lang} id={r.id} status={r.status} labels={{ approve: L.approve, reject: L.reject, cancel: L.cancel, saving: t.common.saving }} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="card">
            <h2 className="section-title border-b border-line px-4 py-3.5 sm:px-6">{E.payslips}</h2>
            {slips.length === 0 ? (
              <EmptyState icon={null} message={E.noPayslips} />
            ) : (
              <ul>
                {slips.map((p) => (
                  <li key={p.id} className="border-b border-line last:border-b-0">
                    <Link href={`/${lang}/hr/payroll/${p.runId}/slip/${p.id}`} className="flex items-center justify-between gap-3 px-4 py-3 text-sm hover:bg-brand-50/50 sm:px-6">
                      <span>{monthLabel(p.year, p.month, lang)}</span>
                      <span className="num font-medium">{money(p.net)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <aside className="grid min-w-0 content-start gap-6 [&>*]:min-w-0">
          <section className="card card-pad">
            <h2 className="section-title mb-3">{E.documentsDue}</h2>
            <dl className="space-y-2.5 text-sm">
              {[
                [E.civilIdExpiry, emp.civilIdExpiry],
                [E.passportExpiry, emp.passportExpiry],
                [E.residencyExpiry, emp.residencyExpiry],
                [E.contractEnd, emp.contractEnd],
              ].map(([label, date]) => (
                <div key={label as string}>
                  <dt className="text-xs text-muted">{label}</dt>
                  <dd>
                    <DocDue date={date as string | null} lang={lang} t={t} today={today} />
                  </dd>
                </div>
              ))}
            </dl>
          </section>

          <section className="card card-pad">
            <h2 className="section-title mb-1">{X.title}</h2>
            {actual ? (
              <>
                <p className="mb-3 text-sm text-muted">
                  {X.reasons[emp.separationReason ?? "other"]} · {formatDate(emp.endDate, lang)}
                </p>
                <dl className="space-y-2 text-sm">
                  <div className="flex justify-between gap-3">
                    <dt className="text-muted">{X.full}</dt>
                    <dd className="num">{money(actual.fullFils)}</dd>
                  </div>
                  {actual.share < 1 && (
                    <div className="flex justify-between gap-3">
                      <dt className="text-muted">{X.share}</dt>
                      <dd className="num">{formatNumber(Math.round(actual.share * 100), lang)}%</dd>
                    </div>
                  )}
                  <div className="flex justify-between gap-3">
                    <dt className="text-muted">{X.indemnity}</dt>
                    <dd className="num">{money(actual.payableFils)}</dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-muted">
                      {X.leaveEncashment} <span className="num">({formatNumber(Math.max(0, annual?.available ?? 0), lang)})</span>
                    </dt>
                    <dd className="num">{money(encash)}</dd>
                  </div>
                  <div className="flex justify-between gap-3 border-t border-line pt-2 font-semibold">
                    <dt>{X.total}</dt>
                    <dd className="num">{money(actual.payableFils + encash)}</dd>
                  </div>
                </dl>
                <p className="hint mt-2">{X.settlementHint}</p>
                <form action={reinstateEmployee} className="mt-4">
                  <input type="hidden" name="lang" value={lang} />
                  <input type="hidden" name="id" value={emp.id} />
                  <SubmitButton className="btn-secondary w-full">{X.reinstate}</SubmitButton>
                </form>
              </>
            ) : (
              <>
                <p className="mb-3 text-xs text-muted">{X.estimate}</p>
                <dl className="space-y-2 text-sm">
                  <div className="flex justify-between gap-3">
                    <dt className="text-muted">{X.ifTerminated}</dt>
                    <dd className="num">{money(ifTerminated.payableFils)}</dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-muted">{X.ifResigns}</dt>
                    <dd className="num">{money(ifResigns.payableFils)}</dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-muted">
                      {X.leaveEncashment} <span className="num">({formatNumber(Math.max(0, annual?.available ?? 0), lang)})</span>
                    </dt>
                    <dd className="num">{money(encash)}</dd>
                  </div>
                </dl>
                <p className="hint mt-3">{X.estimateHint}</p>
                <p className="hint">{X.resignNote}</p>
                <div className="mt-4">
                  <EndServiceForm
                    lang={lang}
                    id={emp.id}
                    today={today}
                    labels={{ record: X.record, endDate: X.endDate, reason: X.reason, reasons: X.reasons, confirm: X.confirm, cancel: t.common.cancel, saving: t.common.saving }}
                  />
                </div>
              </>
            )}
          </section>
        </aside>
      </div>
    </>
  );
}
