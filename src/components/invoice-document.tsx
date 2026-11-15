import type { Dictionary, Locale } from "@/i18n";
import { formatDate, formatMoney } from "@/i18n";
import type { Customer, Invoice, Job, JobItem, Vehicle } from "@/db/schema";
import { BrandMark } from "@/components/logo";
import { percentText } from "@/lib/pricing";

/** The printable invoice, shared by the staff invoice page and the customer's link. */
export function InvoiceDocument({
  lang,
  t,
  invoice,
  job,
  customer,
  vehicle,
  items,
  paid,
  showPhone = true,
  className = "",
}: {
  lang: Locale;
  t: Dictionary;
  invoice: Invoice;
  job: Pick<Job, "code">;
  customer: Pick<Customer, "name" | "phone">;
  vehicle: Pick<Vehicle, "make" | "model" | "year" | "plateNumber">;
  items: JobItem[];
  paid: number;
  showPhone?: boolean;
  className?: string;
}) {
  const balance = invoice.totalFils - paid;
  const name = (i: { nameEn: string; nameAr: string }) => (lang === "ar" ? i.nameAr : i.nameEn);
  return (
    <article className={`card card-pad ${className}`}>
      <header className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <BrandMark className="size-10" />
          <div>
            <p className="font-semibold">{t.app.name}</p>
            <p className="text-xs text-muted">{t.app.tagline}</p>
          </div>
        </div>
        <div className="text-sm sm:text-end">
          <p className="font-semibold">
            <bdi className="num">{invoice.code}</bdi>
          </p>
          <p className="text-muted">
            {t.invoices.issued}: {formatDate(invoice.issuedAt, lang)}
          </p>
          <p className="text-muted">
            <bdi className="num">{job.code}</bdi>
          </p>
        </div>
      </header>

      <div className="mb-6 grid gap-4 text-sm sm:grid-cols-2">
        <div>
          <p className="text-xs text-muted">{t.invoices.billTo}</p>
          <p className="font-medium">{customer.name}</p>
          {showPhone && (
            <p className="num text-muted" dir="ltr">
              <span className="block text-start">{customer.phone}</span>
            </p>
          )}
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
            <dt className="text-muted">
              {t.jobs.discount}
              {invoice.discountPercentBp != null && <span className="num"> ({percentText(invoice.discountPercentBp)}%)</span>}
            </dt>
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
  );
}
