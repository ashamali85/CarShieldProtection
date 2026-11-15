import { Suspense } from "react";
import Link from "next/link";
import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { getDb, schema } from "@/db";
import { formatDateTime, formatMoney, getDictionary, type Locale } from "@/i18n";
import { first, pageContext } from "@/lib/page";
import { UUID_RE } from "@/lib/actions/helpers";
import { recordPayment } from "@/lib/actions/invoices";
import { ActionForm, Field, SubmitButton } from "@/components/forms";
import { InvoiceStatusBadge, PageHeader, PageSkeleton } from "@/components/ui";
import { PrintButton } from "@/components/print-button";
import { can } from "@/lib/auth";
import { InvoiceDocument } from "@/components/invoice-document";
import { headers } from "next/headers";
import { fillTemplate } from "@/lib/whatsapp";
import { WhatsAppSend } from "@/components/whatsapp-send";

export default function InvoicePage(props: PageProps<"/[lang]/invoices/[id]">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <InvoiceDetail {...props} />
    </Suspense>
  );
}

async function InvoiceDetail({ params, searchParams }: PageProps<"/[lang]/invoices/[id]">) {
  const { lang, t, user } = await pageContext(params, { perm: "invoices.view" });
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
  const justPaid = first((await searchParams).paid) === "1";

  // The WhatsApp message in both languages, with the customer's private invoice link.
  const h = await headers();
  const origin = `${h.get("x-forwarded-proto") ?? "https"}://${h.get("x-forwarded-host") ?? h.get("host")}`;
  const message = (l: Locale) => {
    const W = getDictionary(l).invoices.whatsapp;
    const money = (f: number) => formatMoney(f, l);
    return fillTemplate(W.template, {
      name: customer.name,
      invoice: invoice.code,
      car: [vehicle.make, vehicle.model].filter(Boolean).join(" "),
      total: money(invoice.totalFils),
      paid: money(paid),
      balanceLine: balance > 0 ? W.balanceDue.replace("{balance}", money(balance)) : W.paidInFull,
      link: `${origin}/${l}/i/${invoice.shareToken}`,
    });
  };

  return (
    <>
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-3">
            <span>
              <bdi className="num">{invoice.code}</bdi>
            </span>
            <InvoiceStatusBadge status={invoice.status} t={t} />
          </span>
        }
        back={{ href: `/${lang}/jobs/${job.id}`, label: job.code }}
        actions={<PrintButton label={t.common.print} />}
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <InvoiceDocument lang={lang} t={t} invoice={invoice} job={job} customer={customer} vehicle={vehicle} items={items} paid={paid} className="lg:col-span-2" />

        <aside className="no-print grid content-start gap-6">
          {paid > 0 && invoice.shareToken && invoice.status !== "void" && (
            <WhatsAppSend
              lang={lang}
              customerId={customer.id}
              phone={customer.phone}
              messages={{ en: message("en"), ar: message("ar") }}
              defaultLanguage={lang}
              canSavePhone={can(user, "customers.manage")}
              highlight={justPaid}
              labels={t.invoices.whatsapp}
            />
          )}
          {balance > 0 && invoice.status !== "void" && can(user, "invoices.manage") && (
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
