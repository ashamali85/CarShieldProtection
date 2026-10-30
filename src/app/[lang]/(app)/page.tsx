import { Suspense } from "react";
import Link from "next/link";
import { and, count, desc, eq, gte, inArray, lt, lte, sql, sum } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { formatDateTime, formatMoney, formatNumber } from "@/i18n";
import { pageContext, first } from "@/lib/page";
import { addDays, kuwaitDayRange, kuwaitMonthStart, todayKuwait } from "@/lib/dates";
import { EmptyState, JobStatusBadge, PageHeader, PageSkeleton, Stat } from "@/components/ui";

export default function DashboardPage(props: PageProps<"/[lang]">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Dashboard {...props} />
    </Suspense>
  );
}

async function Dashboard({ params, searchParams }: PageProps<"/[lang]">) {
  const { lang, t, user } = await pageContext(params);
  const denied = first((await searchParams).denied) === "1";
  const db = await getDb();
  const today = todayKuwait();
  const [dayStart, dayEnd] = kuwaitDayRange(today);

  const [[active], [scheduledToday], [collected], [invoiced], [paidAll], [expiring], recent, upcoming, [lowStock]] = await Promise.all([
    db.select({ n: count() }).from(schema.jobs).where(inArray(schema.jobs.status, ["in_progress", "quality_check"])),
    db
      .select({ n: count() })
      .from(schema.jobs)
      .where(and(gte(schema.jobs.scheduledAt, dayStart), lt(schema.jobs.scheduledAt, dayEnd), eq(schema.jobs.status, "scheduled"))),
    db.select({ v: sum(schema.payments.amountFils) }).from(schema.payments).where(gte(schema.payments.paidAt, kuwaitMonthStart(today))),
    db.select({ v: sum(schema.invoices.totalFils) }).from(schema.invoices).where(inArray(schema.invoices.status, ["unpaid", "partial"])),
    db
      .select({ v: sum(schema.payments.amountFils) })
      .from(schema.payments)
      .innerJoin(schema.invoices, eq(schema.payments.invoiceId, schema.invoices.id))
      .where(inArray(schema.invoices.status, ["unpaid", "partial"])),
    db
      .select({ n: count() })
      .from(schema.warranties)
      .where(and(eq(schema.warranties.status, "active"), gte(schema.warranties.endsOn, today), lte(schema.warranties.endsOn, addDays(today, 30)))),
    jobRows(db).orderBy(desc(schema.jobs.createdAt)).limit(6),
    jobRows(db)
      .where(and(eq(schema.jobs.status, "scheduled"), gte(schema.jobs.scheduledAt, dayStart)))
      .orderBy(schema.jobs.scheduledAt)
      .limit(6),
    db
      .select({ n: count() })
      .from(schema.inventoryItems)
      .where(and(eq(schema.inventoryItems.active, true), lte(schema.inventoryItems.onHandMilli, schema.inventoryItems.reorderLevelMilli))),
  ]);

  const outstanding = Number(invoiced.v ?? 0) - Number(paidAll.v ?? 0);

  return (
    <>
      <PageHeader
        title={t.dashboard.title}
        subtitle={user.name}
        actions={
          <Link href={`/${lang}/jobs/new`} className="btn-primary">
            {t.dashboard.newJob}
          </Link>
        }
      />
      {denied && (
        <p role="alert" className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {t.errors.forbidden}
        </p>
      )}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label={t.dashboard.activeJobs} value={formatNumber(active.n, lang)} href={`/${lang}/jobs?status=in_progress`} />
        <Stat label={t.dashboard.scheduledToday} value={formatNumber(scheduledToday.n, lang)} href={`/${lang}/jobs?status=scheduled`} />
        <Stat label={t.dashboard.monthRevenue} value={formatMoney(Number(collected.v ?? 0), lang)} href={`/${lang}/invoices`} />
        <Stat label={t.dashboard.outstanding} value={formatMoney(outstanding, lang)} href={`/${lang}/invoices?status=open`} />
      </div>
      {lowStock.n > 0 && (
        <Link
          href={`/${lang}/inventory?filter=low`}
          className="mt-3 flex items-center justify-between rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 hover:bg-red-100"
        >
          <span>{t.inventory.lowStockBanner}</span>
          <span className="num font-semibold">{formatNumber(lowStock.n, lang)}</span>
        </Link>
      )}
      {expiring.n > 0 && (
        <Link
          href={`/${lang}/warranties?state=expiring`}
          className="mt-3 flex items-center justify-between rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 hover:bg-amber-100"
        >
          <span>{t.dashboard.expiringSoon}</span>
          <span className="num font-semibold">{formatNumber(expiring.n, lang)}</span>
        </Link>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <JobList title={t.dashboard.upcoming} rows={upcoming} empty={t.dashboard.noUpcoming} lang={lang} t={t} showDate />
        <JobList title={t.dashboard.recentJobs} rows={recent} empty={t.dashboard.noJobs} lang={lang} t={t} />
      </div>
    </>
  );
}

type Db = Awaited<ReturnType<typeof getDb>>;

function jobRows(db: Db) {
  return db
    .select({
      id: schema.jobs.id,
      number: schema.jobs.number,
      status: schema.jobs.status,
      scheduledAt: schema.jobs.scheduledAt,
      customer: schema.customers.name,
      vehicle: sql<string>`${schema.vehicles.make} || ' ' || ${schema.vehicles.model}`,
      plate: schema.vehicles.plateNumber,
    })
    .from(schema.jobs)
    .innerJoin(schema.customers, eq(schema.jobs.customerId, schema.customers.id))
    .innerJoin(schema.vehicles, eq(schema.jobs.vehicleId, schema.vehicles.id))
    .$dynamic();
}

function JobList({
  title,
  rows,
  empty,
  lang,
  t,
  showDate,
}: {
  title: string;
  rows: Awaited<ReturnType<typeof jobRows>>;
  empty: string;
  lang: Parameters<typeof formatMoney>[1];
  t: Awaited<ReturnType<typeof pageContext>>["t"];
  showDate?: boolean;
}) {
  return (
    <section className="card">
      <h2 className="section-title border-b border-line px-4 py-3 sm:px-6">{title}</h2>
      {rows.length === 0 ? (
        <EmptyState message={empty} />
      ) : (
        <ul>
          {rows.map((r) => (
            <li key={r.id} className="border-b border-line last:border-b-0">
              <Link href={`/${lang}/jobs/${r.id}`} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-canvas sm:px-6">
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">
                    <span className="num text-muted">#{r.number}</span> {r.customer}
                  </span>
                  <span className="block truncate text-xs text-muted">
                    {r.vehicle} · <span className="num" dir="ltr">{r.plate}</span>
                    {showDate && r.scheduledAt && <> · {formatDateTime(r.scheduledAt, lang)}</>}
                  </span>
                </span>
                <JobStatusBadge status={r.status} t={t} />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
