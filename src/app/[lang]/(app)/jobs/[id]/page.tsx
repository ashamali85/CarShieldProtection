import { Suspense } from "react";
import Link from "next/link";
import { eq, sum } from "drizzle-orm";
import { notFound } from "next/navigation";
import { getDb, schema } from "@/db";
import { formatDate, formatDateTime, formatMoney } from "@/i18n";
import type { JobStatus } from "@/db/schema";
import { pageContext } from "@/lib/page";
import { todayKuwait, toLocalInput } from "@/lib/dates";
import { jobMaterials } from "@/lib/inventory";
import { formatQty } from "@/i18n";
import { UUID_RE } from "@/lib/actions/helpers";
import { addJobItem, removeJobItem, saveQcChecklist, setJobMaterial, setJobStatus, updateJobDetails } from "@/lib/actions/jobs";
import { jobDiscount, percentText, QC_CHECKS, qcComplete, subtotalOf } from "@/lib/pricing";
import { assignableStaff } from "@/lib/staff";
import { DiscountField } from "@/components/discount-field";
import { createInvoice } from "@/lib/actions/invoices";
import { ActionForm, Field, SubmitButton } from "@/components/forms";
import { can } from "@/lib/auth";
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

async function JobDetail({ params, searchParams }: PageProps<"/[lang]/jobs/[id]">) {
  const { lang, t, user } = await pageContext(params, { perm: "jobs.view" });
  const canManage = can(user, "jobs.manage");
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

  const blocked = (await searchParams).blocked;
  const [items, [invoice], warranties, services, staff, stockItems, [qcBy]] = await Promise.all([
    db.select().from(schema.jobItems).where(eq(schema.jobItems.jobId, id)).orderBy(schema.jobItems.nameEn),
    db.select().from(schema.invoices).where(eq(schema.invoices.jobId, id)).limit(1),
    db.select().from(schema.warranties).where(eq(schema.warranties.jobId, id)).orderBy(schema.warranties.code),
    db.select().from(schema.services).where(eq(schema.services.active, true)).orderBy(schema.services.nameEn),
    assignableStaff(db),
    job.status === "in_progress"
      ? db
          .select({ id: schema.inventoryItems.id, nameEn: schema.inventoryItems.nameEn, nameAr: schema.inventoryItems.nameAr, unit: schema.inventoryItems.unit })
          .from(schema.inventoryItems)
          .where(eq(schema.inventoryItems.active, true))
          .orderBy(schema.inventoryItems.nameEn)
      : Promise.resolve([]),
    job.qcCheckedBy ? db.select({ name: schema.users.name }).from(schema.users).where(eq(schema.users.id, job.qcCheckedBy)).limit(1) : Promise.resolve([]),
  ]);
  const paid = invoice
    ? Number((await db.select({ v: sum(schema.payments.amountFils) }).from(schema.payments).where(eq(schema.payments.invoiceId, invoice.id)))[0]?.v ?? 0)
    : 0;

  const subtotal = subtotalOf(items);
  const discount = invoice ? invoice.discountFils : jobDiscount(job, subtotal);
  const percentBp = invoice ? invoice.discountPercentBp : job.discountPercentBp;
  const closed = job.status === "cancelled" || job.status === "delivered";
  // Once invoiced, services and the discount need the "change invoiced jobs" permission.
  const editable = canManage && !closed && (!invoice || (invoice.status !== "void" && can(user, "invoices.adjust")));
  const lockedByInvoice = canManage && !closed && !!invoice && !editable;
  const editMaterials = canManage && job.status === "in_progress";
  // A notice from a refused action, shown only while the problem still stands.
  const stillBlocked =
    (blocked === "checklist" && job.status === "quality_check" && !qcComplete(job.qcChecks)) ||
    ((blocked === "noInvoice" || blocked === "unpaid") && job.status === "completed" && invoice?.status !== "paid") ||
    (blocked === "overpaid" && !closed);
  const blockedText = !stillBlocked
    ? null
    : blocked === "noInvoice" && invoice
      ? t.jobs.blocked.unpaid.replace("{amount}", formatMoney(Math.max(invoice.totalFils - paid, 0), lang))
      : blocked === "checklist"
      ? t.jobs.blocked.checklist
      : blocked === "noInvoice"
        ? t.jobs.blocked.noInvoice
        : blocked === "unpaid"
          ? t.jobs.blocked.unpaid.replace("{amount}", formatMoney(Math.max((invoice?.totalFils ?? 0) - paid, 0), lang))
          : blocked === "overpaid"
            ? t.jobs.blocked.overpaid
            : null;
  const today = todayKuwait();
  const name = (i: { nameEn: string; nameAr: string }) => (lang === "ar" ? i.nameAr : i.nameEn);
  const started = !!job.startedAt && job.status !== "cancelled";
  const materials = job.status === "cancelled" ? [] : await jobMaterials(job.id, started);

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
        actions={(canManage ? transitions(job.status, !!invoice) : []).map((tr) => (
          <form key={tr.key} action={setJobStatus}>
            <input type="hidden" name="lang" value={lang} />
            <input type="hidden" name="id" value={job.id} />
            <input type="hidden" name="to" value={tr.to} />
            <SubmitButton className={tr.tone}>{t.jobs.actions[tr.key]}</SubmitButton>
          </form>
        ))}
      />

      {blockedText && (
        <div role="alert" className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <span>{blockedText}</span>
          <span className="flex items-center gap-4">
            {invoice && blocked !== "checklist" && can(user, "invoices.view") && (
              <Link href={`/${lang}/invoices/${invoice.id}`} className="font-medium underline">
                {t.jobs.openInvoice}
              </Link>
            )}
            <Link href={`/${lang}/jobs/${job.id}`} className="px-1 text-lg leading-none" aria-label={t.common.close}>
              ×
            </Link>
          </span>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="grid min-w-0 content-start gap-6 [&>*]:min-w-0 lg:col-span-2">
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
                            <button type="submit" className="btn-ghost px-2 text-red-700" aria-label={`${t.jobs.removeService}: ${name(i)}`} disabled={items.length < 2}>
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
                      <td className="text-muted">
                        {t.jobs.discount}
                        {percentBp != null && <span className="num"> ({percentText(percentBp)}%)</span>}
                      </td>
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
            {lockedByInvoice && <p className="border-t border-line px-4 py-3 text-sm text-muted sm:px-6">{t.jobs.lockedInvoiced}</p>}
            {editable && (
              <ActionForm action={addJobItem} hidden={{ lang, jobId: job.id }} className="flex flex-wrap gap-2 border-t border-line px-4 py-4 sm:px-6">
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
              </ActionForm>
            )}
          </section>

          {!closed || job.notes || job.status === "delivered" ? (
            <section className="card card-pad">
              <h2 className="section-title mb-4">{t.jobs.details}</h2>
              {closed || !canManage ? (
                <DefinitionList
                  items={[
                    { label: t.jobs.technician, value: row.technician ?? t.jobs.unassigned },
                    { label: t.common.notes, value: job.notes ?? t.common.none },
                  ]}
                />
              ) : (
                <ActionForm
                  action={updateJobDetails}
                  hidden={{ lang, id: job.id }}
                  resetOnSuccess={false}
                  successMessage={t.jobs.saved}
                  className="grid gap-4 sm:grid-cols-2"
                >
                  <div>
                    <label htmlFor="f-tech" className="label">
                      {t.jobs.technician}
                    </label>
                    <select id="f-tech" name="technicianId" className="input" defaultValue={job.technicianId ?? ""}>
                      <option value="">{t.jobs.unassigned}</option>
                      {/* Someone no longer assignable stays shown, so saving other details doesn't unassign them. */}
                      {job.technicianId && !staff.some((u) => u.id === job.technicianId) && (
                        <option value={job.technicianId}>{row.technician ?? t.jobs.unassigned}</option>
                      )}
                      {staff.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <Field label={t.jobs.scheduledAt} name="scheduledAt" type="datetime-local" defaultValue={toLocalInput(job.scheduledAt)} />
                  {editable && <DiscountField t={t} fils={job.discountFils} percentBp={job.discountPercentBp} />}
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

          {(materials.length > 0 || editMaterials) && (
            <section className="card">
              <div className="border-b border-line px-4 py-3 sm:px-6">
                <h2 className="section-title">{started ? t.inventory.jobMaterialsUsed : t.inventory.jobMaterialsPlanned}</h2>
                {!started && <p className="mt-0.5 text-sm text-muted">{t.inventory.jobMaterialsNote}</p>}
                {editMaterials && <p className="mt-0.5 text-sm text-muted">{t.jobs.materialsEdit.hint}</p>}
              </div>
              <ul>
                {materials.map((m) => {
                  const short = !started && m.onHandMilli < m.quantityMilli;
                  return (
                    <li key={m.itemId} className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3 text-sm last:border-b-0 sm:px-6">
                      <Link href={`/${lang}/inventory/${m.itemId}`} className="hover:underline">
                        {name(m)}
                      </Link>
                      {editMaterials ? (
                        <ActionForm
                          key={m.quantityMilli}
                          action={setJobMaterial}
                          hidden={{ lang, jobId: job.id, itemId: m.itemId }}
                          resetOnSuccess={false}
                          className="flex items-center gap-2"
                        >
                          <label htmlFor={`qty-${m.itemId}`} className="sr-only">
                            {t.jobs.materialsEdit.used}: {name(m)}
                          </label>
                          <input
                            id={`qty-${m.itemId}`}
                            name="quantity"
                            inputMode="decimal"
                            dir="ltr"
                            defaultValue={String(m.quantityMilli / 1000)}
                            className="input num min-h-9 w-24 py-1 text-end"
                          />
                          <span className="text-muted">{t.inventory.units[m.unit]}</span>
                          <SubmitButton className="btn-secondary min-h-9 px-3 py-1 text-xs" pendingLabel={t.common.saving}>
                            {t.jobs.materialsEdit.update}
                          </SubmitButton>
                        </ActionForm>
                      ) : (
                        <span className="flex items-center gap-2">
                          {short && (
                            <span className="badge bg-red-100 text-red-700">
                              {t.inventory.short} · <span className="num ms-1">{formatQty(m.onHandMilli, lang)}</span>&nbsp;{t.inventory.available}
                            </span>
                          )}
                          <span className="num font-medium">
                            {formatQty(m.quantityMilli, lang)} {t.inventory.units[m.unit]}
                          </span>
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
              {editMaterials && stockItems.length > 0 && (
                <ActionForm action={setJobMaterial} hidden={{ lang, jobId: job.id }} className="flex flex-wrap gap-2 border-t border-line px-4 py-4 sm:px-6">
                  <label htmlFor="add-material" className="sr-only">
                    {t.jobs.materialsEdit.add}
                  </label>
                  <select id="add-material" name="itemId" required defaultValue="" className="input max-w-sm min-w-0 flex-1">
                    <option value="" disabled>
                      {t.jobs.materialsEdit.choose}
                    </option>
                    {stockItems
                      .filter((x) => !materials.some((m) => m.itemId === x.id))
                      .map((x) => (
                        <option key={x.id} value={x.id}>
                          {name(x)} ({t.inventory.units[x.unit]})
                        </option>
                      ))}
                  </select>
                  <label htmlFor="add-material-qty" className="sr-only">
                    {t.jobs.materialsEdit.used}
                  </label>
                  <input id="add-material-qty" name="quantity" required inputMode="decimal" dir="ltr" placeholder="0" className="input num w-24 text-end" />
                  <SubmitButton className="btn-secondary" pendingLabel={t.common.saving}>
                    {t.jobs.materialsEdit.add}
                  </SubmitButton>
                </ActionForm>
              )}
            </section>
          )}

          {(job.status === "quality_check" || job.qcChecks.length > 0) && job.status !== "cancelled" && (
            <section className="card card-pad">
              <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="section-title">{t.jobs.qc.title}</h2>
                <span className="num text-sm text-muted">
                  {t.jobs.qc.progress.replace("{done}", String(job.qcChecks.length)).replace("{total}", String(QC_CHECKS.length))}
                </span>
              </div>
              {job.status === "quality_check" && canManage ? (
                <ActionForm action={saveQcChecklist} hidden={{ lang, id: job.id }} resetOnSuccess={false} successMessage={t.jobs.saved}>
                  <p className="hint mb-3">{t.jobs.qc.hint}</p>
                  <ul className="mb-4 space-y-1">
                    {QC_CHECKS.map((c) => (
                      <li key={c}>
                        <label className="flex min-h-10 cursor-pointer items-start gap-3 rounded-lg px-2 py-2 text-sm hover:bg-canvas">
                          <input type="checkbox" name="check" value={c} defaultChecked={job.qcChecks.includes(c)} className="mt-0.5 size-4 shrink-0 accent-brand-600" />
                          {t.jobs.qc.items[c]}
                        </label>
                      </li>
                    ))}
                  </ul>
                  <SubmitButton className="btn-secondary" pendingLabel={t.common.saving}>
                    {t.jobs.qc.save}
                  </SubmitButton>
                </ActionForm>
              ) : (
                <ul className="space-y-1.5 text-sm">
                  {QC_CHECKS.map((c) => {
                    const done = job.qcChecks.includes(c);
                    return (
                      <li key={c} className={`flex items-start gap-2 ${done ? "" : "text-muted"}`}>
                        <span aria-hidden="true" className={done ? "text-emerald-600" : ""}>
                          {done ? "✓" : "○"}
                        </span>
                        {t.jobs.qc.items[c]}
                      </li>
                    );
                  })}
                </ul>
              )}
              {qcBy && job.qcCheckedAt && (
                <p className="mt-3 text-xs text-muted">{t.jobs.qc.checkedBy.replace("{name}", qcBy.name).replace("{time}", formatDateTime(job.qcCheckedAt, lang))}</p>
              )}
            </section>
          )}

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

        <aside className="grid min-w-0 content-start gap-6 [&>*]:min-w-0">
          <section className="card card-pad">
            <h2 className="section-title mb-3">{t.jobs.customer}</h2>
            {can(user, "customers.view") ? (
              <Link href={`/${lang}/customers/${customer.id}`} className="link">
                {customer.name}
              </Link>
            ) : (
              <span dir="auto">{customer.name}</span>
            )}
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
                {can(user, "invoices.view") ? (
                  <Link href={`/${lang}/invoices/${invoice.id}`} className="link">
                    {t.invoices.number} <span className="num">#{invoice.number}</span>
                  </Link>
                ) : (
                  <span>
                    {t.invoices.number} <span className="num">#{invoice.number}</span>
                  </span>
                )}
                <InvoiceStatusBadge status={invoice.status} t={t} />
              </div>
            ) : job.status !== "cancelled" && items.length > 0 && can(user, "invoices.manage") ? (
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
