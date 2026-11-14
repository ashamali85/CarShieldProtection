import { Suspense } from "react";
import Link from "next/link";
import { and, desc, eq, ilike, inArray, or, sql } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { formatDate, formatMoney } from "@/i18n";
import { first, pageContext } from "@/lib/page";
import { EmptyState, InvoiceStatusBadge, PageHeader, PageSkeleton } from "@/components/ui";
import { codePattern } from "@/lib/doc-numbers";
import { likeAny } from "@/lib/actions/helpers";

export default function InvoicesPage(props: PageProps<"/[lang]/invoices">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Invoices {...props} />
    </Suspense>
  );
}

async function Invoices({ params, searchParams }: PageProps<"/[lang]/invoices">) {
  const { lang, t } = await pageContext(params, { perm: "invoices.view" });
  const open = first((await searchParams).status) === "open";
  const q = (first((await searchParams).q) ?? "").trim().slice(0, 100);
  const db = await getDb();

  const rows = await db
    .select({
      id: schema.invoices.id,
      code: schema.invoices.code,
      status: schema.invoices.status,
      total: schema.invoices.totalFils,
      issuedAt: schema.invoices.issuedAt,
      customer: schema.customers.name,
      jobCode: schema.jobs.code,
      paid: sql<number>`coalesce((select sum(p."amount_fils") from "payments" p where p."invoice_id" = "invoices"."id"), 0)::int`,
    })
    .from(schema.invoices)
    .innerJoin(schema.jobs, eq(schema.invoices.jobId, schema.jobs.id))
    .innerJoin(schema.customers, eq(schema.jobs.customerId, schema.customers.id))
    .where(
      and(
        open ? inArray(schema.invoices.status, ["unpaid", "partial"]) : undefined,
        q
          ? or(
              ilike(schema.invoices.code, codePattern(q)),
              ilike(schema.jobs.code, codePattern(q)),
              ilike(schema.customers.name, likeAny(q)),
              ilike(schema.customers.phone, likeAny(q)),
            )
          : undefined,
      ),
    )
    .orderBy(desc(schema.invoices.issuedAt))
    .limit(200);

  const tab = (href: string, label: string, active: boolean) => (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`inline-flex min-h-9 items-center rounded-full border px-3 text-sm ${
        active ? "border-brand-600 bg-brand-600 text-white" : "border-line bg-white text-muted hover:text-ink"
      }`}
    >
      {label}
    </Link>
  );

  return (
    <>
      <PageHeader title={t.invoices.title} />
      <nav className="mb-4 flex gap-2" aria-label={t.common.status}>
        {tab(`/${lang}/invoices`, t.common.all, !open)}
        {tab(`/${lang}/invoices?status=open`, t.dashboard.outstanding, open)}
      </nav>
      <form className="mb-4 flex flex-wrap gap-2" role="search">
        <label htmlFor="q" className="sr-only">
          {t.common.search}
        </label>
        <input id="q" name="q" type="search" defaultValue={q} placeholder={t.invoices.searchPlaceholder} className="input max-w-md" />
        {open && <input type="hidden" name="status" value="open" />}
        <button type="submit" className="btn-secondary">
          {t.common.search}
        </button>
      </form>
      <div className="card">
        {rows.length === 0 ? (
          <EmptyState message={q ? t.invoices.noMatch : t.invoices.empty} />
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>{t.invoices.number}</th>
                  <th>{t.jobs.customer}</th>
                  <th>{t.invoices.issued}</th>
                  <th className="text-end">{t.common.total}</th>
                  <th className="text-end">{t.invoices.balance}</th>
                  <th>{t.common.status}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <Link href={`/${lang}/invoices/${r.id}`} className="link num">
                        <bdi>{r.code}</bdi>
                      </Link>
                      <span className="block text-xs text-muted">
                        <bdi className="num">{r.jobCode}</bdi>
                      </span>
                    </td>
                    <td>{r.customer}</td>
                    <td className="whitespace-nowrap text-muted">{formatDate(r.issuedAt, lang)}</td>
                    <td className="num text-end whitespace-nowrap">{formatMoney(r.total, lang)}</td>
                    <td className="num text-end whitespace-nowrap">{formatMoney(r.status === "void" ? 0 : r.total - r.paid, lang)}</td>
                    <td>
                      <InvoiceStatusBadge status={r.status} t={t} />
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
