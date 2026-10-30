import { Suspense } from "react";
import Link from "next/link";
import { desc, eq, sql } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { formatDateTime } from "@/i18n";
import type { JobStatus } from "@/db/schema";
import { first, pageContext } from "@/lib/page";
import { EmptyState, JobStatusBadge, PageHeader, PageSkeleton } from "@/components/ui";

const STATUSES: JobStatus[] = ["scheduled", "in_progress", "quality_check", "completed", "delivered", "cancelled"];

export default function JobsPage(props: PageProps<"/[lang]/jobs">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Jobs {...props} />
    </Suspense>
  );
}

async function Jobs({ params, searchParams }: PageProps<"/[lang]/jobs">) {
  const { lang, t } = await pageContext(params);
  const raw = first((await searchParams).status);
  const status = STATUSES.includes(raw as JobStatus) ? (raw as JobStatus) : null;
  const db = await getDb();

  const [rows, counts] = await Promise.all([
    db
      .select({
        id: schema.jobs.id,
        number: schema.jobs.number,
        status: schema.jobs.status,
        scheduledAt: schema.jobs.scheduledAt,
        createdAt: schema.jobs.createdAt,
        customer: schema.customers.name,
        make: schema.vehicles.make,
        model: schema.vehicles.model,
        plate: schema.vehicles.plateNumber,
        technician: schema.users.name,
        totalFils: sql<number>`coalesce((select sum(${schema.jobItems.priceFils} * ${schema.jobItems.quantity}) from ${schema.jobItems} where ${schema.jobItems.jobId} = ${schema.jobs.id}), 0)::int`,
      })
      .from(schema.jobs)
      .innerJoin(schema.customers, eq(schema.jobs.customerId, schema.customers.id))
      .innerJoin(schema.vehicles, eq(schema.jobs.vehicleId, schema.vehicles.id))
      .leftJoin(schema.users, eq(schema.jobs.technicianId, schema.users.id))
      .where(status ? eq(schema.jobs.status, status) : undefined)
      .orderBy(desc(schema.jobs.createdAt))
      .limit(200),
    db.select({ status: schema.jobs.status, n: sql<number>`count(*)::int` }).from(schema.jobs).groupBy(schema.jobs.status),
  ]);
  const countOf = (s: JobStatus) => counts.find((c) => c.status === s)?.n ?? 0;
  const total = counts.reduce((a, c) => a + c.n, 0);

  const tab = (href: string, label: string, n: number, active: boolean) => (
    <Link
      key={href}
      href={href}
      aria-current={active ? "page" : undefined}
      className={`inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3 text-sm whitespace-nowrap ${
        active ? "border-brand-600 bg-brand-600 text-white" : "border-line bg-white text-muted hover:text-ink"
      }`}
    >
      {label}
      <span className="num text-xs opacity-80">{n}</span>
    </Link>
  );

  return (
    <>
      <PageHeader
        title={t.jobs.title}
        actions={
          <Link href={`/${lang}/jobs/new`} className="btn-primary">
            {t.jobs.new}
          </Link>
        }
      />
      <nav className="-mx-4 mb-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0" aria-label={t.common.status}>
        {tab(`/${lang}/jobs`, t.common.all, total, !status)}
        {STATUSES.map((s) => tab(`/${lang}/jobs?status=${s}`, t.jobs.status[s], countOf(s), status === s))}
      </nav>
      <div className="card">
        {rows.length === 0 ? (
          <EmptyState
            message={status ? t.jobs.emptyFilter : t.jobs.empty}
            action={
              !status && (
                <Link href={`/${lang}/jobs/new`} className="btn-primary">
                  {t.jobs.new}
                </Link>
              )
            }
          />
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>{t.jobs.number}</th>
                  <th>{t.jobs.customer}</th>
                  <th>{t.jobs.vehicle}</th>
                  <th>{t.jobs.scheduledAt}</th>
                  <th>{t.jobs.technician}</th>
                  <th>{t.common.status}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((j) => (
                  <tr key={j.id}>
                    <td>
                      <Link href={`/${lang}/jobs/${j.id}`} className="link num">
                        #{j.number}
                      </Link>
                    </td>
                    <td>{j.customer}</td>
                    <td>
                      {j.make} {j.model}
                      <span className="block text-xs text-muted">
                        <span dir="ltr" className="num">{j.plate}</span>
                      </span>
                    </td>
                    <td className="whitespace-nowrap text-muted">{formatDateTime(j.scheduledAt, lang)}</td>
                    <td className="text-muted">{j.technician ?? t.jobs.unassigned}</td>
                    <td>
                      <JobStatusBadge status={j.status} t={t} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
