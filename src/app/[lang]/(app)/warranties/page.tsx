import { Suspense } from "react";
import Link from "next/link";
import { and, desc, eq, gte, ilike, lte, or } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { formatDate } from "@/i18n";
import { first, pageContext } from "@/lib/page";
import { addDays, todayKuwait } from "@/lib/dates";
import { EmptyState, PageHeader, PageSkeleton, WarrantyBadge, warrantyState } from "@/components/ui";

export default function WarrantiesPage(props: PageProps<"/[lang]/warranties">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Warranties {...props} />
    </Suspense>
  );
}

async function Warranties({ params, searchParams }: PageProps<"/[lang]/warranties">) {
  const { lang, t } = await pageContext(params);
  const sp = await searchParams;
  const q = first(sp.q);
  const expiringOnly = first(sp.state) === "expiring";
  const today = todayKuwait();
  const db = await getDb();
  const like = `%${q}%`;

  const rows = await db
    .select({
      w: schema.warranties,
      customer: schema.customers.name,
      customerId: schema.customers.id,
      phone: schema.customers.phone,
      make: schema.vehicles.make,
      model: schema.vehicles.model,
      plate: schema.vehicles.plateNumber,
    })
    .from(schema.warranties)
    .innerJoin(schema.customers, eq(schema.warranties.customerId, schema.customers.id))
    .innerJoin(schema.vehicles, eq(schema.warranties.vehicleId, schema.vehicles.id))
    .where(
      and(
        q
          ? or(
              ilike(schema.warranties.code, like),
              ilike(schema.vehicles.plateNumber, like),
              ilike(schema.customers.phone, like),
              ilike(schema.customers.name, like),
            )
          : undefined,
        expiringOnly
          ? and(eq(schema.warranties.status, "active"), gte(schema.warranties.endsOn, today), lte(schema.warranties.endsOn, addDays(today, 30)))
          : undefined,
      ),
    )
    .orderBy(expiringOnly ? schema.warranties.endsOn : desc(schema.warranties.createdAt))
    .limit(200);

  return (
    <>
      <PageHeader title={t.warranties.title} subtitle={expiringOnly ? t.dashboard.expiringSoon : undefined} />
      <form className="mb-4 flex flex-wrap gap-2" role="search">
        <label htmlFor="q" className="sr-only">
          {t.common.search}
        </label>
        <input id="q" name="q" defaultValue={q} placeholder={t.warranties.searchPlaceholder} className="input max-w-md" />
        {expiringOnly && <input type="hidden" name="state" value="expiring" />}
        <button type="submit" className="btn-secondary">
          {t.common.search}
        </button>
        {expiringOnly && (
          <Link href={`/${lang}/warranties`} className="btn-ghost">
            {t.common.all}
          </Link>
        )}
      </form>
      <div className="card">
        {rows.length === 0 ? (
          <EmptyState message={q || expiringOnly ? t.warranties.emptySearch : t.warranties.empty} />
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>{t.warranties.code}</th>
                  <th>{t.warranties.coverage}</th>
                  <th>{t.jobs.customer}</th>
                  <th>{t.jobs.vehicle}</th>
                  <th>{t.warranties.endsOn}</th>
                  <th>{t.common.status}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ w, ...r }) => (
                  <tr key={w.id}>
                    <td className="num whitespace-nowrap" dir="ltr">
                      <Link href={`/${lang}/jobs/${w.jobId}`} className="link block text-start">
                        {w.code}
                      </Link>
                    </td>
                    <td>{lang === "ar" ? w.nameAr : w.nameEn}</td>
                    <td>
                      <Link href={`/${lang}/customers/${r.customerId}`} className="hover:underline">
                        {r.customer}
                      </Link>
                      <span className="num block text-xs text-muted" dir="ltr">
                        <span className="block text-start">{r.phone}</span>
                      </span>
                    </td>
                    <td>
                      {r.make} {r.model}
                      <span className="num block text-xs text-muted" dir="ltr">
                        <span className="block text-start">{r.plate}</span>
                      </span>
                    </td>
                    <td className="whitespace-nowrap">{formatDate(w.endsOn, lang)}</td>
                    <td>
                      <WarrantyBadge state={warrantyState(w.endsOn, w.status, today)} t={t} />
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
