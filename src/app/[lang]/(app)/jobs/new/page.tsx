import { Suspense } from "react";
import Link from "next/link";
import { asc, desc, eq, ilike, inArray, or } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { formatMoney } from "@/i18n";
import { first, pageContext } from "@/lib/page";
import { UUID_RE } from "@/lib/actions/helpers";
import { createJob } from "@/lib/actions/jobs";
import { ActionForm, Field, SubmitButton } from "@/components/forms";
import { EmptyState, PageHeader, PageSkeleton } from "@/components/ui";
import { VehicleForm } from "@/components/vehicle-form";

export default function NewJobPage(props: PageProps<"/[lang]/jobs/new">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <NewJob {...props} />
    </Suspense>
  );
}

async function NewJob({ params, searchParams }: PageProps<"/[lang]/jobs/new">) {
  const { lang, t } = await pageContext(params);
  const sp = await searchParams;
  const customerId = first(sp.customer);
  const q = first(sp.q);
  const db = await getDb();
  const back = { href: `/${lang}/jobs`, label: t.jobs.title };

  // Step 1: pick a customer
  if (!UUID_RE.test(customerId)) {
    const like = `%${q}%`;
    const byPlate = db.select({ id: schema.vehicles.customerId }).from(schema.vehicles).where(ilike(schema.vehicles.plateNumber, like));
    const customers = await db
      .select({ id: schema.customers.id, name: schema.customers.name, phone: schema.customers.phone })
      .from(schema.customers)
      .where(q ? or(ilike(schema.customers.name, like), ilike(schema.customers.phone, like), inArray(schema.customers.id, byPlate)) : undefined)
      .orderBy(desc(schema.customers.createdAt))
      .limit(30);

    return (
      <>
        <PageHeader title={t.jobs.new} subtitle={t.jobs.chooseCustomer} back={back} />
        <div className="card max-w-2xl">
          <form className="flex gap-2 border-b border-line p-4" role="search">
            <label htmlFor="q" className="sr-only">
              {t.common.search}
            </label>
            <input id="q" name="q" defaultValue={q} placeholder={t.customers.searchPlaceholder} className="input" autoFocus />
            <button type="submit" className="btn-secondary">
              {t.common.search}
            </button>
          </form>
          {customers.length === 0 ? (
            <EmptyState
              message={q ? t.customers.emptySearch : t.customers.empty}
              action={
                <Link href={`/${lang}/customers/new`} className="btn-primary">
                  {t.customers.new}
                </Link>
              }
            />
          ) : (
            <ul>
              {customers.map((c) => (
                <li key={c.id} className="border-b border-line last:border-b-0">
                  <Link href={`/${lang}/jobs/new?customer=${c.id}`} className="flex items-center justify-between px-4 py-3 hover:bg-canvas">
                    <span className="text-sm font-medium">{c.name}</span>
                    <span className="num text-sm text-muted" dir="ltr">
                      {c.phone}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          <div className="border-t border-line p-4">
            <Link href={`/${lang}/customers/new`} className="link text-sm">
              + {t.customers.new}
            </Link>
          </div>
        </div>
      </>
    );
  }

  // Step 2: vehicle, services and scheduling
  const [customer] = await db.select().from(schema.customers).where(eq(schema.customers.id, customerId)).limit(1);
  if (!customer) {
    return <EmptyState message={t.errors.notFound} action={<Link href={`/${lang}/jobs/new`} className="btn-secondary">{t.common.back}</Link>} />;
  }
  const [vehicles, services, technicians] = await Promise.all([
    db.select().from(schema.vehicles).where(eq(schema.vehicles.customerId, customerId)).orderBy(asc(schema.vehicles.createdAt)),
    db.select().from(schema.services).where(eq(schema.services.active, true)).orderBy(schema.services.category, schema.services.nameEn),
    db.select({ id: schema.users.id, name: schema.users.name }).from(schema.users).where(eq(schema.users.active, true)).orderBy(schema.users.name),
  ]);

  if (vehicles.length === 0) {
    return (
      <>
        <PageHeader title={t.jobs.new} subtitle={customer.name} back={back} />
        <div className="card card-pad max-w-3xl">
          <p className="mb-4 text-sm text-muted">{t.jobs.noVehicleForCustomer}</p>
          <VehicleForm lang={lang} t={t} customerId={customerId} next="job" />
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title={t.jobs.new}
        subtitle={customer.name}
        back={back}
        actions={
          <Link href={`/${lang}/jobs/new`} className="btn-ghost">
            {t.jobs.chooseCustomer}
          </Link>
        }
      />
      <ActionForm action={createJob} hidden={{ lang, customerId }} className="grid max-w-3xl gap-6">
        <fieldset className="card card-pad">
          <legend className="section-title float-start mb-3 w-full">{t.jobs.chooseVehicle}</legend>
          <div className="clear-both grid gap-2 sm:grid-cols-2">
            {vehicles.map((v, i) => (
              <label key={v.id} className="flex cursor-pointer items-center gap-3 rounded-lg border border-line p-3 has-checked:border-brand-500 has-checked:bg-brand-50">
                <input type="radio" name="vehicleId" value={v.id} defaultChecked={i === 0} required className="accent-brand-600" />
                <span className="text-sm">
                  <span className="auto-dir block font-medium" dir="auto">
                    {v.make} {v.model} {v.year && <span className="num text-muted">({v.year})</span>}
                  </span>
                  <span className="num block text-muted" dir="ltr">
                    {v.plateNumber}
                  </span>
                </span>
              </label>
            ))}
          </div>
          <Link href={`/${lang}/customers/${customerId}`} className="link mt-3 inline-block text-sm">
            + {t.customers.addVehicle}
          </Link>
        </fieldset>

        <fieldset className="card card-pad">
          <legend className="section-title float-start mb-3 w-full">{t.jobs.services}</legend>
          <div className="clear-both grid gap-2">
            {services.map((s) => (
              <label key={s.id} className="flex cursor-pointer items-center gap-3 rounded-lg border border-line p-3 has-checked:border-brand-500 has-checked:bg-brand-50">
                <input type="checkbox" name="serviceId" value={s.id} className="size-4 accent-brand-600" />
                <span className="min-w-0 flex-1 text-sm">
                  <span className="block font-medium">{lang === "ar" ? s.nameAr : s.nameEn}</span>
                  <span className="block text-xs text-muted">
                    {t.services.categories[s.category]} ·{" "}
                    {s.warrantyMonths > 0 ? `${s.warrantyMonths} ${t.common.months}` : t.services.noWarranty}
                  </span>
                </span>
                <span className="num text-sm font-medium">{formatMoney(s.priceFils, lang)}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset className="card card-pad grid gap-4 sm:grid-cols-2">
          <Field label={t.jobs.scheduledAt} name="scheduledAt" type="datetime-local" optionalLabel={t.common.optional} />
          <div>
            <label htmlFor="f-tech" className="label">
              {t.jobs.technician} <span className="font-normal text-muted">({t.common.optional})</span>
            </label>
            <select id="f-tech" name="technicianId" className="input" defaultValue="">
              <option value="">{t.jobs.unassigned}</option>
              {technicians.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
          </div>
          <Field label={t.jobs.discount} name="discount" inputMode="decimal" dir="ltr" placeholder="0.000" optionalLabel={t.common.optional} />
          <div className="sm:col-span-2">
            <label htmlFor="f-notes" className="label">
              {t.common.notes} <span className="font-normal text-muted">({t.common.optional})</span>
            </label>
            <textarea id="f-notes" name="notes" rows={3} className="input" />
          </div>
        </fieldset>

        <div>
          <SubmitButton pendingLabel={t.common.saving}>{t.jobs.create}</SubmitButton>
        </div>
      </ActionForm>
    </>
  );
}
