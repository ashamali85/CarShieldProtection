import { Suspense } from "react";
import Link from "next/link";
import { count, desc, eq, ilike, inArray, or } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { formatDate } from "@/i18n";
import { first, pageContext } from "@/lib/page";
import { EmptyState, PageHeader, PageSkeleton } from "@/components/ui";

export default function CustomersPage(props: PageProps<"/[lang]/customers">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Customers {...props} />
    </Suspense>
  );
}

async function Customers({ params, searchParams }: PageProps<"/[lang]/customers">) {
  const { lang, t } = await pageContext(params);
  const q = first((await searchParams).q);
  const db = await getDb();

  let where;
  if (q) {
    const like = `%${q}%`;
    const byPlate = db
      .select({ id: schema.vehicles.customerId })
      .from(schema.vehicles)
      .where(ilike(schema.vehicles.plateNumber, like));
    where = or(ilike(schema.customers.name, like), ilike(schema.customers.phone, like), inArray(schema.customers.id, byPlate));
  }

  const rows = await db
    .select({
      id: schema.customers.id,
      name: schema.customers.name,
      phone: schema.customers.phone,
      createdAt: schema.customers.createdAt,
      vehicles: count(schema.vehicles.id),
    })
    .from(schema.customers)
    .leftJoin(schema.vehicles, eq(schema.vehicles.customerId, schema.customers.id))
    .where(where)
    .groupBy(schema.customers.id)
    .orderBy(desc(schema.customers.createdAt))
    .limit(200);

  return (
    <>
      <PageHeader
        title={t.customers.title}
        actions={
          <Link href={`/${lang}/customers/new`} className="btn-primary">
            {t.customers.new}
          </Link>
        }
      />
      <form className="mb-4 flex gap-2" role="search">
        <label htmlFor="q" className="sr-only">
          {t.common.search}
        </label>
        <input id="q" name="q" defaultValue={q} placeholder={t.customers.searchPlaceholder} className="input max-w-md" />
        <button type="submit" className="btn-secondary">
          {t.common.search}
        </button>
      </form>
      <div className="card">
        {rows.length === 0 ? (
          <EmptyState
            message={q ? t.customers.emptySearch : t.customers.empty}
            action={
              !q && (
                <Link href={`/${lang}/customers/new`} className="btn-primary">
                  {t.customers.new}
                </Link>
              )
            }
          />
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>{t.customers.name}</th>
                  <th>{t.customers.phone}</th>
                  <th>{t.customers.vehicles}</th>
                  <th>{t.customers.since}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((c) => (
                  <tr key={c.id}>
                    <td>
                      <Link href={`/${lang}/customers/${c.id}`} className="link">
                        {c.name}
                      </Link>
                    </td>
                    <td className="num" dir="ltr">
                      <span className="block text-start">{c.phone}</span>
                    </td>
                    <td className="num">{c.vehicles}</td>
                    <td className="text-muted">{formatDate(c.createdAt, lang)}</td>
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
