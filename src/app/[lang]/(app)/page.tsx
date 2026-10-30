import { Suspense, type ReactNode } from "react";
import Link from "next/link";
import { and, count, desc, eq, gte, inArray, lt, lte, sql, sum } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { formatDateTime, formatLongDate, formatMoney, formatNumber } from "@/i18n";
import { pageContext, first } from "@/lib/page";
import { addDays, kuwaitDayRange, kuwaitHour, kuwaitMonthStart, todayKuwait } from "@/lib/dates";
import { EmptyState, JobStatusBadge, PageSkeleton, Stat } from "@/components/ui";
import { BRAND } from "@/components/logo";

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
      <Hero
        lang={lang}
        t={t}
        name={user.name}
        actions={
          <Link href={`/${lang}/jobs/new`} className="btn-primary">
            <span aria-hidden="true" className="text-base leading-none">+</span>
            {t.dashboard.newJob}
          </Link>
        }
      />
      {denied && (
        <p role="alert" className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {t.errors.forbidden}
        </p>
      )}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat icon="jobs" label={t.dashboard.activeJobs} value={formatNumber(active.n, lang)} href={`/${lang}/jobs?status=in_progress`} />
        <Stat icon="calendar" label={t.dashboard.scheduledToday} value={formatNumber(scheduledToday.n, lang)} href={`/${lang}/jobs?status=scheduled`} />
        <Stat icon="revenue" label={t.dashboard.monthRevenue} value={formatMoney(Number(collected.v ?? 0), lang)} href={`/${lang}/invoices`} />
        <Stat icon="due" label={t.dashboard.outstanding} value={formatMoney(outstanding, lang)} href={`/${lang}/invoices?status=open`} />
      </div>
      {lowStock.n > 0 && (
        <Link
          href={`/${lang}/inventory?filter=low`}
          className="mt-3 flex items-center justify-between rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 hover:bg-red-100"
        >
          <span>{t.inventory.lowStockBanner}</span>
          <span className="num font-semibold">{formatNumber(lowStock.n, lang)}</span>
        </Link>
      )}
      {expiring.n > 0 && (
        <Link
          href={`/${lang}/warranties?state=expiring`}
          className="mt-3 flex items-center justify-between rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 hover:bg-amber-100"
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
type T = Awaited<ReturnType<typeof pageContext>>["t"];

/** Welcome banner: the Higgsfield workshop photo behind a navy fade, greeting on the open side. */
function Hero({ lang, t, name, actions }: { lang: Parameters<typeof formatMoney>[1]; t: T; name: string; actions: ReactNode }) {
  const hour = kuwaitHour();
  const greeting = hour < 12 ? t.dashboard.greeting.morning : hour < 17 ? t.dashboard.greeting.afternoon : t.dashboard.greeting.evening;
  const firstName = name.trim().split(/\s+/)[0];
  return (
    <section className="relative mt-2 mb-6 overflow-hidden rounded-3xl bg-brand-950 text-white shadow-(--shadow-lift)">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={BRAND.banner}
        alt=""
        aria-hidden="true"
        width={1344}
        height={576}
        fetchPriority="high"
        className="absolute inset-0 h-full w-full object-cover object-right rtl:-scale-x-100"
      />
      <div className="absolute inset-0 bg-linear-to-r from-brand-950 from-25% via-brand-950/80 via-55% to-brand-900/5 rtl:bg-linear-to-l" />
      <div className="relative flex min-h-52 max-w-xl flex-col justify-center gap-2 p-6 sm:min-h-60 sm:p-8">
        <p className="text-xs font-semibold tracking-[0.12em] text-brand-200 uppercase">{formatLongDate(new Date(), lang)}</p>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          {greeting}
          {t.dashboard.greetingSep}
          <span dir="auto">{firstName}</span>
        </h1>
        <p className="text-sm text-silver-300 sm:text-base">{t.dashboard.heroLine}</p>
        <div className="mt-3 flex flex-wrap gap-2">{actions}</div>
      </div>
    </section>
  );
}

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
  t: T;
  showDate?: boolean;
}) {
  return (
    <section className="card">
      <h2 className="section-title border-b border-line px-4 py-3.5 sm:px-6">{title}</h2>
      {rows.length === 0 ? (
        <EmptyState message={empty} icon={showDate ? "calendar" : "car"} />
      ) : (
        <ul>
          {rows.map((r) => (
            <li key={r.id} className="border-b border-line last:border-b-0">
              <Link href={`/${lang}/jobs/${r.id}`} className="flex items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-brand-50/50 sm:px-6">
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
