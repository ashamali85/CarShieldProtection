import { Suspense } from "react";
import Link from "next/link";
import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { getDb, schema } from "@/db";
import { formatDate, formatDateTime, formatMoney } from "@/i18n";
import type { JobStatus } from "@/db/schema";
import { pageContext } from "@/lib/page";
import { todayKuwait, toLocalInput } from "@/lib/dates";
import { UUID_RE } from "@/lib/actions/helpers";
import { addJobItem, removeJobItem, setJobStatus, updateJobDetails } from "@/lib/actions/jobs";
import { createInvoice } from "@/lib/actions/invoices";
import { ActionForm, Field, SubmitButton } from "@/components/forms";
import {
  DefinitionList,
  InvoiceStatusBadge,
  JobStatusBadge,
  PageHeader,
  PageSkeleton,
  WarrantyBadge,
  warrantyState,
} from "@/components/ui";

export default function JobPage(props: PageProps<"/[lang]/jobs/[id]">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <JobDetail {...props} />
    </Suspense>
  );
}

type Transition = { to: JobStatus; key: "start" | "qc" | "complete" | "deliver" | "cancel"; tone: string };

function transitions(status: JobStatus, hasInvoice: boolean): Transition[] {
  const list: Record<JobStatus, Transition[]> = {
    scheduled: [{ to: "in_progress", key: "start", tone: "btn-primary" }],
    in_progress: [{ to: "quality_check", key: "qc", tone: "btn-primary" }],
    quality_check: [
      { to: "completed", key: "complete", tone: "btn-primary" },
      { to: "in_progress", key: "start", tone: "btn-secondary" },
    ],
    completed: [{ to: "delivered", key: "deliver", tone: "btn-primary" }],
    delivered: [],
    cancelled: [],
  };
  const out = [...list[status]];
  if (!hasInvoice && (status === "scheduled" || status === "in_progress")) {
    out.push({ to: "cancelled", key: "cancel", tone: "btn-danger" });
  }
  return out;
}

async function JobDetail({ params }: PageProps<"/[lang]/jobs/[id]">) {
  const { lang, t } = await pageContext(params);
  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();
  const db = await getDb();

  const [row] = await db
    .select({ job: schema.jobs, customer: schema.customers, vehicle: schema.vehicles, technician: schema.users.name })
    .from(schema.jobs)
    .innerJoin(schema.customers, eq(schema.jobs.customerId, schema.customers.id))
    .innerJoin(schema.vehicles, eq(schema.jobs.vehicleId, schema.vehicles.id))
    .leftJoin(schema.users, eq(schema.jobs.technicianId, schema.users.id))
    .where(eq(schema.jobs.id, id))
    .limit(1);
  if (!row) notFound();
  const { job, customer, vehicle } = row;

  const [items, [invoice], warranties, services, staff] = await Promise.all([
    db.select().from(schema.jobItems).where(eq(schema.jobItems.jobId, id)).orderBy(schema.jobItems.nameEn),
    db.select().from(schema.invoices).where(eq(schema.invoices.jobId, id)).limit(1),
    db.select().from(schema.warranties).where(eq(schema.warranties.jobId, id)).orderBy(schema.warranties.code),
    db.select().from(schema.services).where(eq(schema.services.active, true)).orderBy(schema.services.nameEn),
    db.select({ id: schema.users.id, name: schema.users.name }).from(schema.users).where(eq(schema.users.active, true)).orderBy(schema.users.name),
  ]);

  const subtotal = items.reduce((a, i) => a + i.priceFils * i.quantity, 0);
  const discount = invoice ? invoice.discountFils : Math.min(job.discountFils, subtotal);
  const editable = !invoice && job.status !== "cancelled" && job.status !== "delivered";
  const closed = job.status === "cancelled" || job.status === "delivered";
  const today = todayKuwait();
  const name = (i: { nameEn: string; nameAr: string }) => (lang === "ar" ? i.nameAr : i.nameEn);

  return (
    <>
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-3">
            <span>
              {t.jobs.number} <span className="num">#{job.number}</span>
            </span>
            <JobStatusBadge status={job.status} t={t} />
          </span>
        }
        subtitle={<span dir="auto" className="auto-dir block">{`${customer.name} · ${vehicle.make} ${vehicle.model}`}</span>}
        back={{ href: `/${lang}/jobs`, label: t.jobs.title }}
        actions={transitions(job.status, !!invoice).map((tr) => (
          <form key={tr.key} action={setJobStatus}>
            <input type="hidden" name="lang" value={lang} />
            <input type="hidden" name="id" value={job.id} />
            <input type="hidden" name="to" value={tr.to} />
            <SubmitButton className={tr.tone}>{t.jobs.actions[tr.key]}</SubmitButton>
          </form>
        ))}
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="grid content-start gap-6 lg:col-span-2">
          <section className="card">
            <h2 className="section-title border-b border-line px-4 py-3 sm:px-6">{t.jobs.services}</h2>
            <div className="table-wrap">
              <table className="table">
                <tbody>
                  {items.map((i) => (
                    <tr key={i.id}>
                      <td>
                        <span className="block font-medium">{name(i)}</span>
                        <span className="block text-xs text-muted">
                          {i.warrantyMonths > 0 ? `${i.warrantyMonths} ${t.common.months}` : t.services.noWarranty}
                        </span>
                      </td>
                      <td className="num text-end whitespace-nowrap">{formatMoney(i.priceFils * i.quantity, lang)}</td>
                      {editable && (
                        <td className="w-10 text-end">
                          <form action={removeJobItem}>
                            <input type="hidden" name="lang" value={lang} />
                            <input type="hidden" name="jobId" value={job.id} />
                            <input type="hidden" name="itemId" value={i.id} />
                            <button type="submit" className="btn-ghost px-2 text-red-700" aria-label={`${t.common.cancel}: ${name(i)}`}>
                              ×
                            </button>
                          </form>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
                <tfoot className="text-sm">
                  <tr>
                    <td className="text-muted">{t.jobs.subtotal}</td>
                    <td className="num text-end">{formatMoney(subtotal, lang)}</td>
                    {editable && <td />}
                  </tr>
                  {discount > 0 && (
                    <tr>
                      <td className="text-muted">{t.jobs.discount.replace(/\s*\(.*\)/, "")}</td>
                      <td className="num text-end">−{formatMoney(discount, lang)}</td>
                      {editable && <td />}
                    </tr>
                  )}
                  <tr>
                    <td className="font-semibold">{t.common.total}</td>
                    <td className="num text-end font-semibold">{formatMoney(subtotal - discount, lang)}</td>
                    {editable && <td />}
                  </tr>
                </tfoot>
              </table>
            </div>
            {editable && (
              <form action={addJobItem} className="flex flex-wrap gap-2 border-t border-line px-4 py-4 sm:px-6">
                <input type="hidden" name="lang" value={lang} />
                <input type="hidden" name="jobId" value={job.id} />
                <label htmlFor="add-service" className="sr-only">
                  {t.jobs.services}
                </label>
                <select id="add-service" name="serviceId" className="input max-w-sm flex-1" required defaultValue="">
                  <option value="" disabled>
                    {t.jobs.services}…
                  </option>
                  {services.map((s) => (
                    <option key={s.id} value={s.id}>
                      {name(s)} — {formatMoney(s.priceFils, lang)}
                    </option>
                  ))}
                </select>
                <SubmitButton className="btn-secondary">{t.common.add}</SubmitButton>
              </form>
            )}
          </section>

          {!closed || job.notes || job.status === "delivered" ? (
            <section className="card card-pad">
              <h2 className="section-title mb-4">{t.jobs.details}</h2>
              {closed ? (
                <DefinitionList
                  items={[
                    { label: t.jobs.technician, value: row.technician ?? t.jobs.unassigned },
                    { label: t.common.notes, value: job.notes ?? t.common.none },
                  ]}
                />
              ) : (
                <ActionForm action={updateJobDetails} hidden={{ lang, id: job.id }} className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label htmlFor="f-tech" className="label">
                      {t.jobs.technician}
                    </label>
                    <select id="f-tech" name="technicianId" className="input" defaultValue={job.technicianId ?? ""}>
                      <option value="">{t.jobs.unassigned}</option>
                      {staff.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <Field label={t.jobs.scheduledAt} name="scheduledAt" type="datetime-local" defaultValue={toLocalInput(job.scheduledAt)} />
                  <Field
                    label={t.jobs.discount}
                    name="discount"
                    inputMode="decimal"
                    dir="ltr"
                    defaultValue={(job.discountFils / 1000).toFixed(3)}
                    disabled={!!invoice}
                  />
                  <div className="sm:col-span-2">
                    <label htmlFor="f-notes" className="label">
                      {t.common.notes}
                    </label>
                    <textarea id="f-notes" name="notes" rows={3} className="input" defaultValue={job.notes ?? ""} />
                  </div>
                  <div>
                    <SubmitButton pendingLabel={t.common.saving}>{t.common.save}</SubmitButton>
                  </div>
                </ActionForm>
              )}
            </section>
          ) : null}

          <section className="card">
            <h2 className="section-title border-b border-line px-4 py-3 sm:px-6">{t.jobs.warranties}</h2>
            {warranties.length === 0 ? (
              <p className="px-4 py-4 text-sm text-muted sm:px-6">{t.jobs.warrantiesNote}</p>
            ) : (
              <ul>
                {warranties.map((w) => (
                  <li key={w.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3 last:border-b-0 sm:px-6">
                    <span className="text-sm">
                      <span className="num block font-medium" dir="ltr">
                        <span className="block text-start">{w.code}</span>
                      </span>
                      <span className="block text-xs text-muted">
                        {name(w)} · {formatDate(w.startsOn, lang)} – {formatDate(w.endsOn, lang)}
                      </span>
                    </span>
                    <WarrantyBadge state={warrantyState(w.endsOn, w.status, today)} t={t} />
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <aside className="grid content-start gap-6">
          <section className="card card-pad">
            <h2 className="section-title mb-3">{t.jobs.customer}</h2>
            <Link href={`/${lang}/customers/${customer.id}`} className="link">
              {customer.name}
            </Link>
            <p className="num mt-1 text-sm text-muted" dir="ltr">
              <span className="block text-start">{customer.phone}</span>
            </p>
            <h2 className="section-title mt-5 mb-1">{t.jobs.vehicle}</h2>
            <p className="auto-dir text-sm" dir="auto">
              {vehicle.make} {vehicle.model} {vehicle.year && <span className="num text-muted">({vehicle.year})</span>}
            </p>
            <p className="num text-sm text-muted" dir="ltr">
              <span className="block text-start">{vehicle.plateNumber}</span>
            </p>
            {vehicle.color && <p className="text-sm text-muted">{vehicle.color}</p>}
          </section>

          <section className="card card-pad">
            <h2 className="section-title mb-3">{t.jobs.invoice}</h2>
            {invoice ? (
              <div className="flex items-center justify-between gap-2">
                <Link href={`/${lang}/invoices/${invoice.id}`} className="link">
                  {t.invoices.number} <span className="num">#{invoice.number}</span>
                </Link>
                <InvoiceStatusBadge status={invoice.status} t={t} />
              </div>
            ) : job.status !== "cancelled" && items.length > 0 ? (
              <form action={createInvoice}>
                <input type="hidden" name="lang" value={lang} />
                <input type="hidden" name="jobId" value={job.id} />
                <SubmitButton className="btn-secondary w-full">{t.jobs.createInvoice}</SubmitButton>
              </form>
            ) : (
              <p className="text-sm text-muted">{t.common.none}</p>
            )}
          </section>

          <section className="card card-pad">
            <h2 className="section-title mb-3">{t.jobs.timeline}</h2>
            <DefinitionList
              items={[
                { label: t.jobs.scheduledAt, value: formatDateTime(job.scheduledAt, lang) },
                { label: t.jobs.created, value: formatDateTime(job.createdAt, lang) },
                { label: t.jobs.started, value: formatDateTime(job.startedAt, lang) },
                { label: t.jobs.completed, value: formatDateTime(job.completedAt, lang) },
                { label: t.jobs.delivered, value: formatDateTime(job.deliveredAt, lang) },
              ]}
            />
          </section>
        </aside>
      </div>
    </>
  );
}
