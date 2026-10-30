import { Suspense } from "react";
import Link from "next/link";
import { desc, eq, sql } from "drizzle-orm";
import { notFound } from "next/navigation";
import { getDb, schema } from "@/db";
import { formatDate } from "@/i18n";
import { pageContext } from "@/lib/page";
import { UUID_RE } from "@/lib/actions/helpers";
import { deleteVehicle } from "@/lib/actions/customers";
import { DefinitionList, EmptyState, JobStatusBadge, PageHeader, PageSkeleton } from "@/components/ui";
import { VehicleForm } from "@/components/vehicle-form";
import { getPickerMakes, pickerLabels } from "@/lib/catalog";

export default function CustomerPage(props: PageProps<"/[lang]/customers/[id]">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <CustomerDetail {...props} />
    </Suspense>
  );
}

async function CustomerDetail({ params }: PageProps<"/[lang]/customers/[id]">) {
  const { lang, t } = await pageContext(params);
  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();
  const db = await getDb();

  const [customer] = await db.select().from(schema.customers).where(eq(schema.customers.id, id)).limit(1);
  if (!customer) notFound();

  const [vehicles, jobs] = await Promise.all([
    db
      .select({
        vehicle: schema.vehicles,
        jobCount: sql<number>`(select count(*)::int from "jobs" j where j."vehicle_id" = "vehicles"."id")`,
      })
      .from(schema.vehicles)
      .where(eq(schema.vehicles.customerId, id))
      .orderBy(schema.vehicles.createdAt),
    db
      .select({
        id: schema.jobs.id,
        number: schema.jobs.number,
        status: schema.jobs.status,
        createdAt: schema.jobs.createdAt,
        plate: schema.vehicles.plateNumber,
        make: schema.vehicles.make,
        model: schema.vehicles.model,
      })
      .from(schema.jobs)
      .innerJoin(schema.vehicles, eq(schema.jobs.vehicleId, schema.vehicles.id))
      .where(eq(schema.jobs.customerId, id))
      .orderBy(desc(schema.jobs.createdAt)),
  ]);

  return (
    <>
      <PageHeader
        title={customer.name}
        subtitle={`${t.customers.since} ${formatDate(customer.createdAt, lang)}`}
        back={{ href: `/${lang}/customers`, label: t.customers.title }}
        actions={
          <>
            <Link href={`/${lang}/customers/${id}/edit`} className="btn-secondary">
              {t.common.edit}
            </Link>
            {vehicles.length > 0 && (
              <Link href={`/${lang}/jobs/new?customer=${id}`} className="btn-primary">
                {t.jobs.new}
              </Link>
            )}
          </>
        }
      />

      <div className="grid gap-6">
        <section className="card card-pad">
          <h2 className="section-title mb-4">{t.customers.details}</h2>
          <DefinitionList
            items={[
              { label: t.customers.phone, value: <span className="num" dir="ltr">{customer.phone}</span> },
              { label: t.customers.email, value: customer.email ?? t.common.none },
              { label: t.customers.civilId, value: customer.civilId ? <span className="num">{customer.civilId}</span> : t.common.none },
              { label: t.common.notes, value: customer.notes ?? t.common.none },
            ]}
          />
        </section>

        <section className="card">
          <h2 className="section-title border-b border-line px-4 py-3 sm:px-6">{t.customers.vehicles}</h2>
          {vehicles.length === 0 ? (
            <EmptyState message={t.customers.noVehicles} />
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>{t.vehicles.vehicle}</th>
                    <th>{t.vehicles.plate}</th>
                    <th>{t.vehicles.color}</th>
                    <th>{t.vehicles.vin}</th>
                    <th>
                      <span className="sr-only">{t.common.actions}</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {vehicles.map(({ vehicle: v, jobCount }) => (
                    <tr key={v.id}>
                      <td className="auto-dir" dir="auto">
                        {v.make} {v.model} {v.year && <span className="num text-muted">({v.year})</span>}
                        {v.bodyType && <span className="block text-xs text-muted">{t.vehicles.bodyTypes[v.bodyType]}</span>}
                      </td>
                      <td className="num" dir="ltr">
                        <span className="block text-start">{v.plateNumber}</span>
                      </td>
                      <td>{v.color ?? t.common.none}</td>
                      <td className="num text-xs text-muted" dir="ltr">
                        <span className="block text-start">{v.vin ?? "—"}</span>
                      </td>
                      <td className="text-end">
                        {jobCount === 0 && (
                          <form action={deleteVehicle}>
                            <input type="hidden" name="lang" value={lang} />
                            <input type="hidden" name="id" value={v.id} />
                            <input type="hidden" name="customerId" value={id} />
                            <button type="submit" className="btn-ghost px-2 text-xs text-red-700">
                              ×<span className="sr-only">{`${v.make} ${v.model}`}</span>
                            </button>
                          </form>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="border-t border-line px-4 py-4 sm:px-6">
            <h3 className="mb-3 text-sm font-semibold">{t.customers.addVehicle}</h3>
            <VehicleForm lang={lang} t={t} customerId={id} makes={await getPickerMakes()} labels={pickerLabels(t)} />
          </div>
        </section>

        <section className="card">
          <h2 className="section-title border-b border-line px-4 py-3 sm:px-6">{t.customers.jobs}</h2>
          {jobs.length === 0 ? (
            <EmptyState message={t.customers.noJobs} />
          ) : (
            <ul>
              {jobs.map((j) => (
                <li key={j.id} className="border-b border-line last:border-b-0">
                  <Link href={`/${lang}/jobs/${j.id}`} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-canvas sm:px-6">
                    <span className="text-sm">
                      <span className="num font-medium">#{j.number}</span>{" "}
                      <span className="text-muted">
                        {j.make} {j.model} · <span dir="ltr" className="num">{j.plate}</span> · {formatDate(j.createdAt, lang)}
                      </span>
                    </span>
                    <JobStatusBadge status={j.status} t={t} />
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
