import { Suspense } from "react";
import Link from "next/link";
import { and, eq, ilike, lte, or, sql } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { formatMoney, formatQty } from "@/i18n";
import { first, pageContext } from "@/lib/page";
import { EmptyState, PageHeader, PageSkeleton } from "@/components/ui";
import { StockLevel } from "@/components/inventory-form";

export default function InventoryPage(props: PageProps<"/[lang]/inventory">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Inventory {...props} />
    </Suspense>
  );
}

async function Inventory({ params, searchParams }: PageProps<"/[lang]/inventory">) {
  const { lang, t, user } = await pageContext(params);
  const sp = await searchParams;
  const q = first(sp.q);
  const lowOnly = first(sp.filter) === "low";
  const isAdmin = user.role === "admin";
  const db = await getDb();
  const like = `%${q}%`;

  const rows = await db
    .select({
      item: schema.inventoryItems,
      services: sql<number>`(select count(*)::int from "service_materials" sm where sm."item_id" = "inventory_items"."id")`,
    })
    .from(schema.inventoryItems)
    .where(
      and(
        q ? or(ilike(schema.inventoryItems.nameEn, like), ilike(schema.inventoryItems.nameAr, like), ilike(schema.inventoryItems.sku, like)) : undefined,
        lowOnly ? and(eq(schema.inventoryItems.active, true), lte(schema.inventoryItems.onHandMilli, schema.inventoryItems.reorderLevelMilli)) : undefined,
      ),
    )
    .orderBy(schema.inventoryItems.nameEn);

  return (
    <>
      <PageHeader
        title={t.inventory.title}
        actions={
          isAdmin && (
            <Link href={`/${lang}/inventory/new`} className="btn-primary">
              {t.inventory.new}
            </Link>
          )
        }
      />
      <form className="mb-4 flex flex-wrap items-center gap-2" role="search">
        <label htmlFor="q" className="sr-only">
          {t.common.search}
        </label>
        <input id="q" name="q" defaultValue={q} placeholder={t.inventory.searchPlaceholder} className="input max-w-xs" />
        <label className="flex min-h-10 items-center gap-2 px-1 text-sm">
          <input type="checkbox" name="filter" value="low" defaultChecked={lowOnly} className="size-4 accent-brand-600" />
          {t.inventory.lowOnly}
        </label>
        <button type="submit" className="btn-secondary">
          {t.common.search}
        </button>
      </form>
      <div className="card">
        {rows.length === 0 ? (
          <EmptyState
            message={q || lowOnly ? t.inventory.emptySearch : t.inventory.empty}
            action={
              !q && !lowOnly && isAdmin && (
                <Link href={`/${lang}/inventory/new`} className="btn-primary">
                  {t.inventory.new}
                </Link>
              )
            }
          />
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>{t.users.name}</th>
                  <th>{t.inventory.sku}</th>
                  <th>{t.inventory.onHand}</th>
                  <th>{t.inventory.reorderLevel}</th>
                  <th className="text-end">{t.inventory.unitCost.replace(/\s*\(.*\)/, "")}</th>
                  <th>{t.inventory.usedIn}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ item: i, services }) => (
                  <tr key={i.id} className={i.active ? "" : "text-muted"}>
                    <td>
                      <Link href={`/${lang}/inventory/${i.id}`} className="link">
                        {lang === "ar" ? i.nameAr : i.nameEn}
                      </Link>
                      {!i.active && <span className="badge ms-2 bg-slate-100 text-slate-600">{t.common.inactive}</span>}
                    </td>
                    <td className="num text-muted" dir="ltr">
                      <span className="block text-start">{i.sku ?? "—"}</span>
                    </td>
                    <td>
                      <StockLevel onHand={i.onHandMilli} reorder={i.reorderLevelMilli} unit={i.unit} lang={lang} t={t} format={formatQty} />
                    </td>
                    <td className="num text-muted">
                      {formatQty(i.reorderLevelMilli, lang)} {t.inventory.units[i.unit]}
                    </td>
                    <td className="num text-end">{i.unitCostFils != null ? formatMoney(i.unitCostFils, lang) : "—"}</td>
                    <td className="num">{services}</td>
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
