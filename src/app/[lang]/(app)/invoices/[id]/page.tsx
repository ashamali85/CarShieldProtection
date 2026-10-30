import { Suspense } from "react";
import Link from "next/link";
import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { getDb, schema } from "@/db";
import { formatDate, formatDateTime, formatMoney } from "@/i18n";
import { pageContext } from "@/lib/page";
import { UUID_RE } from "@/lib/actions/helpers";
import { recordPayment } from "@/lib/actions/invoices";
import { ActionForm, Field, SubmitButton } from "@/components/forms";
import { InvoiceStatusBadge, PageHeader, PageSkeleton } from "@/components/ui";
import { ShieldMark } from "@/components/logo";
import { PrintButton } from "@/components/print-button";

export default function InvoicePage(props: PageProps<"/[lang]/invoices/[id]">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <InvoiceDetail {...props} />
    </Suspense>
  );
}

async function InvoiceDetail({ params }: PageProps<"/[lang]/invoices/[id]">) {
  const { lang, t } = await pageContext(params);
  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();
  const db = await getDb();

  const [row] = await db
    .select({ invoice: schema.invoices, job: schema.jobs, customer: schema.customers, vehicle: schema.vehicles })
    .from(schema.invoices)
    .innerJoin(schema.jobs, eq(schema.invoices.jobId, schema.jobs.id))
    .innerJoin(schema.customers, eq(schema.jobs.customerId, schema.customers.id))
    .innerJoin(schema.vehicles, eq(schema.jobs.vehicleId, schema.vehicles.id))
    .where(eq(schema.invoices.id, id))
    .limit(1);
  if (!row) notFound();
  const { invoice, job, customer, vehicle } = row;

  const [items, payments] = await Promise.all([
    db.select().from(schema.jobItems).where(eq(schema.jobItems.jobId, job.id)).orderBy(schema.jobItems.nameEn),
    db
      .select({ payment: schema.payments, by: schema.users.name })
      .from(schema.payments)
      .leftJoin(schema.users, eq(schema.payments.receivedBy, schema.users.id))
      .where(eq(schema.payments.invoiceId, id))
      .orderBy(schema.payments.paidAt),
  ]);
  const paid = payments.reduce((a, p) => a + p.payment.amountFils, 0);
  const balance = invoice.totalFils - paid;
  const name = (i: { nameEn: string; nameAr: string }) => (lang === "ar" ? i.nameAr : i.nameEn);

  return (
    <>
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-3">
            <span>
              {t.invoices.number} <span className="num">#{invoice.number}</span>
            </span>
            <InvoiceStatusBadge status={invoice.status} t={t} />
          </span>
        }
        back={{ href: `/${lang}/jobs/${job.id}`, label: `${t.jobs.number} #${job.number}` }}
        actions={<PrintButton label={t.common.print} />}
      />

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Printable invoice */}
        <article className="card card-pad lg:col-span-2">
          <header className="mb-8 flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <ShieldMark className="size-10" />
              <div>
                <p className="font-semibold">{t.app.name}</p>
                <p className="text-xs text-muted">{t.app.tagline}</p>
              </div>
            </div>
            <div className="text-sm sm:text-end">
              <p className="font-semibold">
                {t.invoices.number} <span className="num">#{invoice.number}</span>
              </p>
              <p className="text-muted">
                {t.invoices.issued}: {formatDate(invoice.issuedAt, lang)}
              </p>
              <p className="text-muted">
                {t.jobs.number} <span className="num">#{job.number}</span>
              </p>
            </div>
          </header>

          <div className="mb-6 grid gap-4 text-sm sm:grid-cols-2">
            <div>
              <p className="text-xs text-muted">{t.invoices.billTo}</p>
              <p className="font-medium">{customer.name}</p>
              <p className="num text-muted" dir="ltr">
                <span className="block text-start">{customer.phone}</span>
              </p>
            </div>
            <div>
              <p className="text-xs text-muted">{t.jobs.vehicle}</p>
              <p className="auto-dir font-medium" dir="auto">
                {vehicle.make} {vehicle.model} {vehicle.year && <span className="num">({vehicle.year})</span>}
              </p>
              <p className="num text-muted" dir="ltr">
                <span className="block text-start">{vehicle.plateNumber}</span>
              </p>
            </div>
          </div>

          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th className="ps-0">{t.invoices.item}</th>
                  <th className="text-end">{t.invoices.qty}</th>
                  <th className="text-end">{t.invoices.unitPrice}</th>
                  <th className="pe-0 text-end">{t.invoices.lineTotal}</th>
                </tr>
              </thead>
              <tbody>
                {items.map((i) => (
                  <tr key={i.id}>
                    <td className="ps-0">{name(i)}</td>
                    <td className="num text-end">{i.quantity}</td>
                    <td className="num text-end whitespace-nowrap">{formatMoney(i.priceFils, lang)}</td>
                    <td className="num pe-0 text-end whitespace-nowrap">{formatMoney(i.priceFils * i.quantity, lang)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <dl className="ms-auto mt-4 grid max-w-xs grid-cols-2 gap-y-1.5 text-sm">
            <dt className="text-muted">{t.jobs.subtotal}</dt>
            <dd className="num text-end">{formatMoney(invoice.subtotalFils, lang)}</dd>
            {invoice.discountFils > 0 && (
              <>
                <dt className="text-muted">{t.jobs.discount.replace(/\s*\(.*\)/, "")}</dt>
                <dd className="num text-end">−{formatMoney(invoice.discountFils, lang)}</dd>
              </>
            )}
            <dt className="border-t border-line pt-1.5 font-semibold">{t.common.total}</dt>
            <dd className="num border-t border-line pt-1.5 text-end font-semibold">{formatMoney(invoice.totalFils, lang)}</dd>
            <dt className="text-muted">{t.invoices.paid}</dt>
            <dd className="num text-end">{formatMoney(paid, lang)}</dd>
            <dt className="font-semibold">{t.invoices.balance}</dt>
            <dd className="num text-end font-semibold">{formatMoney(balance, lang)}</dd>
          </dl>

          <p className="mt-10 text-center text-sm text-muted">{t.invoices.thanks}</p>
        </article>

        <aside className="no-print grid content-start gap-6">
          {balance > 0 && invoice.status !== "void" && (
            <section className="card card-pad">
              <h2 className="section-title mb-4">{t.invoices.recordPayment}</h2>
              <ActionForm action={recordPayment} hidden={{ lang, invoiceId: invoice.id }} className="space-y-4">
                <Field
                  label={t.invoices.amount}
                  name="amount"
                  required
                  inputMode="decimal"
                  dir="ltr"
                  defaultValue={(balance / 1000).toFixed(3)}
                />
                <div>
                  <label htmlFor="f-method" className="label">
                    {t.invoices.method}
                  </label>
                  <select id="f-method" name="method" className="input" defaultValue="knet">
                    {(["knet", "cash", "card", "transfer"] as const).map((m) => (
                      <option key={m} value={m}>
                        {t.invoices.methods[m]}
                      </option>
                    ))}
                  </select>
                </div>
                <Field label={t.invoices.reference} name="reference" dir="ltr" optionalLabel={t.common.optional} />
                <SubmitButton className="btn-primary w-full" pendingLabel={t.common.saving}>
                  {t.invoices.recordPayment}
                </SubmitButton>
              </ActionForm>
            </section>
          )}

          <section className="card">
            <h2 className="section-title border-b border-line px-4 py-3 sm:px-6">{t.invoices.payments}</h2>
            {payments.length === 0 ? (
              <p className="px-4 py-4 text-sm text-muted sm:px-6">{t.invoices.noPayments}</p>
            ) : (
              <ul>
                {payments.map(({ payment: p, by }) => (
                  <li key={p.id} className="border-b border-line px-4 py-3 text-sm last:border-b-0 sm:px-6">
                    <div className="flex justify-between gap-2">
                      <span className="font-medium">{t.invoices.methods[p.method]}</span>
                      <span className="num">{formatMoney(p.amountFils, lang)}</span>
                    </div>
                    <p className="text-xs text-muted">
                      {formatDateTime(p.paidAt, lang)}
                      {by && <> · {by}</>}
                      {p.reference && (
                        <>
                          {" "}
                          · <span className="num" dir="ltr">{p.reference}</span>
                        </>
                      )}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <Link href={`/${lang}/customers/${customer.id}`} className="link text-sm">
            {customer.name}
          </Link>
        </aside>
      </div>
    </>
  );
}
