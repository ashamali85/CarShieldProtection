import { Suspense } from "react";
import Link from "next/link";
import { and, desc, eq, gte, lte, sql } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { formatDate, formatNumber } from "@/i18n";
import type { LeaveStatus } from "@/db/schema";
import { first, pageContext } from "@/lib/page";
import { todayKuwait } from "@/lib/dates";
import { EmptyState, PageHeader, PageSkeleton } from "@/components/ui";
import { LeaveStatusBadge, PayBreakdown } from "@/components/hr/ui";
import { LeaveActions } from "@/components/hr/leave-actions";

const FILTERS = ["pending", "approved", "all"] as const;

export default function LeavePage(props: PageProps<"/[lang]/hr/leave">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Leave {...props} />
    </Suspense>
  );
}

async function Leave({ params, searchParams }: PageProps<"/[lang]/hr/leave">) {
  const { lang, t } = await pageContext(params, { admin: true });
  const raw = first((await searchParams).status);
  const filter = (FILTERS as readonly string[]).includes(raw)
    ? (raw as (typeof FILTERS)[number])
    : "all";
  const L = t.hr.leave;
  const db = await getDb();
  const today = todayKuwait();

  // A fresh query builder each time: Drizzle builders are mutable, so one can't be shared by two queries.
  const base = () =>
    db
      .select({
        r: schema.leaveRequests,
        employeeId: schema.employees.id,
        name: schema.employees.fullName,
        nameAr: schema.employees.fullNameAr,
        typeEn: schema.leaveTypes.nameEn,
        typeAr: schema.leaveTypes.nameAr,
      })
      .from(schema.leaveRequests)
      .innerJoin(
        schema.employees,
        eq(schema.leaveRequests.employeeId, schema.employees.id),
      )
      .innerJoin(
        schema.leaveTypes,
        eq(schema.leaveRequests.leaveTypeId, schema.leaveTypes.id),
      );

  const [rows, offToday, counts] = await Promise.all([
    base()
      .where(
        filter === "all"
          ? undefined
          : eq(schema.leaveRequests.status, filter as LeaveStatus),
      )
      .orderBy(desc(schema.leaveRequests.startDate))
      .limit(200),
    base().where(
      and(
        eq(schema.leaveRequests.status, "approved"),
        lte(schema.leaveRequests.startDate, today),
        gte(schema.leaveRequests.endDate, today),
      ),
    ),
    db
      .select({
        status: schema.leaveRequests.status,
        n: sql<number>`count(*)::int`,
      })
      .from(schema.leaveRequests)
      .groupBy(schema.leaveRequests.status),
  ]);
  const countOf = (s: string) =>
    s === "all"
      ? counts.reduce((a, c) => a + c.n, 0)
      : (counts.find((c) => c.status === s)?.n ?? 0);
  const label = {
    pending: L.status.pending,
    approved: L.status.approved,
    all: t.common.all,
  };
  const nm = (en: string, ar: string | null) => (lang === "ar" && ar ? ar : en);

  return (
    <>
      <PageHeader
        title={L.title}
        actions={
          <Link href={`/${lang}/hr/leave/new`} className="btn-primary">
            {L.record}
          </Link>
        }
      />
      {offToday.length > 0 && (
        <section className="mb-4 flex flex-wrap items-center gap-2 text-sm">
          <span className="font-medium">{L.offToday}:</span>
          {offToday.map(({ r, employeeId, name, nameAr, typeEn, typeAr }) => (
            <Link
              key={r.id}
              href={`/${lang}/hr/employees/${employeeId}`}
              className="badge bg-brand-50 py-1 text-brand-800 hover:bg-brand-100"
            >
              {nm(name, nameAr)} · {lang === "ar" ? typeAr : typeEn}
            </Link>
          ))}
        </section>
      )}
      <nav className="mb-4 flex gap-2" aria-label={L.statusLabel}>
        {FILTERS.map((f) => (
          <Link
            key={f}
            href={`/${lang}/hr/leave${f === "all" ? "" : `?status=${f}`}`}
            aria-current={filter === f ? "page" : undefined}
            className={`inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3 text-sm ${filter === f ? "border-brand-600 bg-brand-600 text-white" : "border-line bg-white text-muted hover:text-ink"}`}
          >
            {label[f]}
            <span className="num text-xs opacity-80">{countOf(f)}</span>
          </Link>
        ))}
      </nav>
      <div className="card">
        {rows.length === 0 ? (
          <EmptyState
            icon="calendar"
            message={filter === "all" ? L.empty : L.emptyFilter}
            action={
              filter === "all" && (
                <Link href={`/${lang}/hr/leave/new`} className="btn-primary">
                  {L.record}
                </Link>
              )
            }
          />
        ) : (
          <div className="table-wrap">
            <table className="table min-w-[48rem]">
              <thead>
                <tr>
                  <th>{L.employee}</th>
                  <th>{L.type}</th>
                  <th>{L.start}</th>
                  <th>{L.end}</th>
                  <th className="text-end">{L.days}</th>
                  <th>{L.pay}</th>
                  <th>{L.statusLabel}</th>
                  <th>
                    <span className="sr-only">{t.common.actions}</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ r, employeeId, name, nameAr, typeEn, typeAr }) => (
                  <tr key={r.id}>
                    <td>
                      <Link
                        href={`/${lang}/hr/employees/${employeeId}`}
                        className="link auto-dir"
                        dir="auto"
                      >
                        {nm(name, nameAr)}
                      </Link>
                    </td>
                    <td>
                      {lang === "ar" ? typeAr : typeEn}
                      {r.reason && (
                        <span className="block max-w-48 truncate text-xs text-muted">
                          {r.reason}
                        </span>
                      )}
                    </td>
                    <td className="num whitespace-nowrap">
                      {formatDate(r.startDate, lang)}
                    </td>
                    <td className="num whitespace-nowrap">
                      {formatDate(r.endDate, lang)}
                    </td>
                    <td className="num text-end">
                      {formatNumber(r.days, lang)}
                    </td>
                    <td className="text-xs">
                      <PayBreakdown breakdown={r.payBreakdown} t={t} />
                    </td>
                    <td>
                      <LeaveStatusBadge status={r.status} t={t} />
                    </td>
                    <td>
                      <LeaveActions
                        lang={lang}
                        id={r.id}
                        status={r.status}
                        labels={{
                          approve: L.approve,
                          reject: L.reject,
                          cancel: L.cancel,
                          saving: t.common.saving,
                        }}
                      />
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
