import { Suspense } from "react";
import Link from "next/link";
import { and, asc, desc, eq, gte, lte, sql } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { formatDate, formatMoney, formatNumber } from "@/i18n";
import { pageContext } from "@/lib/page";
import { todayKuwait } from "@/lib/dates";
import { getHrSettings } from "@/lib/hr-data";
import { addDaysIso, calendarDays, monthlyWage, pifss } from "@/lib/hr";
import { EmptyState, PageHeader, PageSkeleton, Stat } from "@/components/ui";
import { PayrollStatusBadge, monthLabel } from "@/components/hr/ui";
import { can } from "@/lib/auth";

export default function HrOverviewPage(props: PageProps<"/[lang]/hr">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Overview {...props} />
    </Suspense>
  );
}

async function Overview({ params }: PageProps<"/[lang]/hr">) {
  const { lang, t, user } = await pageContext(params, { perm: "hr.view" });
  const canManage = can(user, "hr.manage");
  const O = t.hr.overview;
  const E = t.hr.employees;
  const db = await getDb();
  const today = todayKuwait();
  const soon = addDaysIso(today, 60);
  const fortnight = addDaysIso(today, 14);

  const [s, staff, upcomingLeave, [pending], runs] = await Promise.all([
    getHrSettings(db),
    db.select().from(schema.employees).where(eq(schema.employees.status, "active")).orderBy(asc(schema.employees.fullName)),
    db
      .select({ r: schema.leaveRequests, employeeId: schema.employees.id, name: schema.employees.fullName, nameAr: schema.employees.fullNameAr, typeEn: schema.leaveTypes.nameEn, typeAr: schema.leaveTypes.nameAr })
      .from(schema.leaveRequests)
      .innerJoin(schema.employees, eq(schema.leaveRequests.employeeId, schema.employees.id))
      .innerJoin(schema.leaveTypes, eq(schema.leaveRequests.leaveTypeId, schema.leaveTypes.id))
      .where(and(eq(schema.leaveRequests.status, "approved"), lte(schema.leaveRequests.startDate, fortnight), gte(schema.leaveRequests.endDate, today)))
      .orderBy(asc(schema.leaveRequests.startDate)),
    db.select({ n: sql<number>`count(*)::int` }).from(schema.leaveRequests).where(eq(schema.leaveRequests.status, "pending")),
    db.select().from(schema.payrollRuns).orderBy(desc(schema.payrollRuns.year), desc(schema.payrollRuns.month)).limit(4),
  ]);

  const offToday = upcomingLeave.filter((l) => l.r.startDate <= today).length;
  const monthlyCost = staff.reduce((a, e) => a + monthlyWage(e) + (e.isKuwaiti ? pifss(e.pifssSalaryFils ?? monthlyWage(e), s).employer : 0), 0);
  const nm = (en: string, ar: string | null) => (lang === "ar" && ar ? ar : en);

  const expiring = staff
    .flatMap((e) =>
      (
        [
          [E.civilIdExpiry, e.civilIdExpiry],
          [E.passportExpiry, e.passportExpiry],
          [E.residencyExpiry, e.residencyExpiry],
          [E.contractEnd, e.contractEnd],
        ] as const
      )
        .filter(([, d]) => d && d <= soon)
        .map(([label, d]) => ({ e, label, date: d as string })),
    )
    .sort((a, b) => a.date.localeCompare(b.date));

  return (
    <>
      <PageHeader
        title={t.hr.title}
        subtitle={O.subtitle}
        actions={
          <>
            {canManage && (
              <>
                <Link href={`/${lang}/hr/leave/new`} className="btn-secondary">
                  {t.hr.leave.record}
                </Link>
                <Link href={`/${lang}/hr/employees/new`} className="btn-primary">
                  {E.new}
                </Link>
              </>
            )}
          </>
        }
      />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat icon="jobs" label={O.activeEmployees} value={formatNumber(staff.length, lang)} href={`/${lang}/hr/employees`} />
        <Stat icon="calendar" label={O.onLeaveToday} value={formatNumber(offToday, lang)} href={`/${lang}/hr/leave`} />
        <Stat icon="due" label={O.pendingLeave} value={formatNumber(pending.n, lang)} href={`/${lang}/hr/leave?status=pending`} />
        <Stat icon="revenue" label={O.monthlyCost} value={formatMoney(monthlyCost, lang)} href={`/${lang}/hr/payroll`} />
      </div>
      <p className="hint mt-2 text-end">{O.monthlyCostHint}</p>

      <div className="mt-4 grid gap-6 lg:grid-cols-2">
        <section className="card">
          <h2 className="section-title border-b border-line px-4 py-3.5 sm:px-6">{O.expiring}</h2>
          {expiring.length === 0 ? (
            <EmptyState icon={null} message={O.noExpiring} />
          ) : (
            <ul>
              {expiring.map(({ e, label, date }) => {
                const days = date >= today ? calendarDays(today, date) - 1 : -1;
                return (
                  <li key={`${e.id}-${label}`} className="border-b border-line last:border-b-0">
                    <Link href={`/${lang}/hr/employees/${e.id}`} className="flex items-center justify-between gap-3 px-4 py-3 text-sm hover:bg-brand-50/50 sm:px-6">
                      <span className="min-w-0">
                        <span className="auto-dir block truncate font-medium" dir="auto">
                          {nm(e.fullName, e.fullNameAr)}
                        </span>
                        <span className="block text-xs text-muted">
                          {label} · <span className="num">{formatDate(date, lang)}</span>
                        </span>
                      </span>
                      <span className={`badge ${days < 0 ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-800"}`}>
                        {days < 0 ? O.expired : O.inDays.replace("{n}", String(days))}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className="card">
          <h2 className="section-title border-b border-line px-4 py-3.5 sm:px-6">{O.whoIsOff}</h2>
          {upcomingLeave.length === 0 ? (
            <EmptyState icon={null} message={O.nobodyOff} />
          ) : (
            <ul>
              {upcomingLeave.map(({ r, employeeId, name, nameAr, typeEn, typeAr }) => (
                <li key={r.id} className="border-b border-line last:border-b-0">
                  <Link href={`/${lang}/hr/employees/${employeeId}`} className="flex items-center justify-between gap-3 px-4 py-3 text-sm hover:bg-brand-50/50 sm:px-6">
                    <span className="min-w-0">
                      <span className="auto-dir block truncate font-medium" dir="auto">
                        {nm(name, nameAr)}
                      </span>
                      <span className="block text-xs text-muted">{lang === "ar" ? typeAr : typeEn}</span>
                    </span>
                    <span className="num shrink-0 text-xs text-muted">
                      {formatDate(r.startDate, lang)} → {formatDate(r.endDate, lang)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card lg:col-span-2">
          <h2 className="section-title border-b border-line px-4 py-3.5 sm:px-6">{O.recentRuns}</h2>
          {runs.length === 0 ? (
            <EmptyState
              icon={null}
              message={O.noRuns}
              action={
                <Link href={`/${lang}/hr/payroll`} className="btn-primary">
                  {t.hr.payroll.start}
                </Link>
              }
            />
          ) : (
            <ul className="grid sm:grid-cols-2 xl:grid-cols-4">
              {runs.map((r) => (
                <li key={r.id} className="border-b border-line sm:border-e">
                  <Link href={`/${lang}/hr/payroll/${r.id}`} className="flex items-center justify-between gap-3 px-4 py-3 text-sm hover:bg-brand-50/50 sm:px-6">
                    <span>{monthLabel(r.year, r.month, lang)}</span>
                    <PayrollStatusBadge status={r.status} t={t} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}
