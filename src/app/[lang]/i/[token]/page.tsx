import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { eq, sum } from "drizzle-orm";
import { dbFor, schema, trainingEnabled } from "@/db";
import type { Db } from "@/db";
import { getDictionary, isLocale } from "@/i18n";
import { InvoiceDocument } from "@/components/invoice-document";
import { PrintButton } from "@/components/print-button";

export async function generateMetadata({ params }: PageProps<"/[lang]/i/[token]">): Promise<Metadata> {
  const { lang } = await params;
  // Never indexed, and the link isn't passed on to other sites.
  return isLocale(lang) ? { title: getDictionary(lang).invoices.shared.title, robots: { index: false, follow: false }, referrer: "no-referrer" } : {};
}

/** A customer's read-only invoice, opened from the link sent on WhatsApp. No sign-in needed. */
export default function SharedInvoicePage(props: PageProps<"/[lang]/i/[token]">) {
  return (
    <Suspense fallback={<main className="min-h-dvh bg-canvas" />}>
      <SharedInvoice {...props} />
    </Suspense>
  );
}

const TOKEN_RE = /^[A-Za-z0-9_-]{24,100}$/;

async function findInvoice(db: Db, token: string) {
  const [row] = await db
    .select({ invoice: schema.invoices, job: schema.jobs, customer: schema.customers, vehicle: schema.vehicles })
    .from(schema.invoices)
    .innerJoin(schema.jobs, eq(schema.invoices.jobId, schema.jobs.id))
    .innerJoin(schema.customers, eq(schema.jobs.customerId, schema.customers.id))
    .innerJoin(schema.vehicles, eq(schema.jobs.vehicleId, schema.vehicles.id))
    .where(eq(schema.invoices.shareToken, token))
    .limit(1);
  return row;
}

async function SharedInvoice({ params }: PageProps<"/[lang]/i/[token]">) {
  const { lang, token } = await params;
  if (!isLocale(lang)) notFound();
  const t = getDictionary(lang);
  const S = t.invoices.shared;

  // The real shop first; a link made from the training copy opens from there.
  let db = await dbFor("live");
  let row = TOKEN_RE.test(token) ? await findInvoice(db, token) : undefined;
  if (!row && TOKEN_RE.test(token) && trainingEnabled()) {
    db = await dbFor("training");
    row = await findInvoice(db, token);
  }
  if (!row || row.invoice.status === "void") {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-canvas px-4">
        <p className="card card-pad max-w-md text-center text-muted">{S.notFound}</p>
      </main>
    );
  }
  const { invoice, job, customer, vehicle } = row;
  const [items, [paidRow]] = await Promise.all([
    db.select().from(schema.jobItems).where(eq(schema.jobItems.jobId, job.id)).orderBy(schema.jobItems.nameEn),
    db.select({ v: sum(schema.payments.amountFils) }).from(schema.payments).where(eq(schema.payments.invoiceId, invoice.id)),
  ]);
  const other = lang === "ar" ? "en" : "ar";

  return (
    <main className="min-h-dvh bg-canvas px-4 py-6 sm:py-10">
      <div className="mx-auto max-w-3xl">
        <div className="no-print mb-4 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted">{S.note}</p>
          <div className="flex items-center gap-3">
            <Link href={`/${other}/i/${token}`} hrefLang={other} className="link text-sm">
              {other === "ar" ? "العربية" : "English"}
            </Link>
            <PrintButton label={t.common.print} />
          </div>
        </div>
        <InvoiceDocument lang={lang} t={t} invoice={invoice} job={job} customer={customer} vehicle={vehicle} items={items} paid={Number(paidRow?.v ?? 0)} showPhone={false} />
      </div>
    </main>
  );
}
