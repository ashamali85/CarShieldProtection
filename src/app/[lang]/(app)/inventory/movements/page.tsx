import { Suspense } from "react";
import Link from "next/link";
import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { formatDateTime, formatMoney, formatQty } from "@/i18n";
import { first, pageContext } from "@/lib/page";
import { EmptyState, PageHeader, PageSkeleton } from "@/components/ui";
import { InventoryTabs } from "@/components/area-tabs";
import { can } from "@/lib/auth";
import { UUID_RE } from "@/lib/actions/helpers";

export default function StockMovementsPage(props: PageProps<"/[lang]/inventory/movements">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Movements {...props} />
    </Suspense>
  );
}

async function Movements({ params, searchParams }: PageProps<"/[lang]/inventory/movements">) {
  const { lang, t, user } = await pageContext(params, { perm: "inventory.view" });
  const I = t.inventory;
  const sp = await searchParams;
  const type = first(sp.type);
  const itemId = first(sp.item);
  const canManage = can(user, "inventory.manage");
  const db = await getDb();
  const M = schema.inventoryMovements;

  const reasons = type === "restock" ? (["restock"] as const) : type === "adjustment" ? (["adjustment"] as const) : (["restock", "adjustment"] as const);
  const [rows, items] = await Promise.all([
    db
      .select({ mv: M, item: schema.inventoryItems, by: schema.users.name })
      .from(M)
      .innerJoin(schema.inventoryItems, eq(schema.inventoryItems.id, M.itemId))
      .leftJoin(schema.users, eq(schema.users.id, M.userId))
      .where(and(inArray(M.reason, [...reasons]), UUID_RE.test(itemId) ? eq(M.itemId, itemId) : undefined))
      .orderBy(desc(M.createdAt))
      .limit(300),
    db
      .select({ id: schema.inventoryItems.id, nameEn: schema.inventoryItems.nameEn, nameAr: schema.inventoryItems.nameAr })
      .from(schema.inventoryItems)
      .where(isNull(schema.inventoryItems.deletedAt))
      .orderBy(schema.inventoryItems.nameEn),
  ]);

  return (
    <>
      <PageHeader title={I.title} />
      <InventoryTabs lang={lang} t={t} current="movements" />
      <p className="mb-4 mt-4 max-w-3xl text-sm text-muted">{I.movementsSubtitle}</p>

      <form className="mb-4 flex flex-wrap items-end gap-2" role="search">
        <div>
          <label htmlFor="m-type" className="label">
            {t.inventory.type}
          </label>
          <select id="m-type" name="type" defaultValue={type} className="input">
            <option value="">{I.allTypes}</option>
            <option value="restock">{I.purchases}</option>
            <option value="adjustment">{I.counts}</option>
          </select>
        </div>
        <div>
          <label htmlFor="m-item" className="label">
            {I.item}
          </label>
          <select id="m-item" name="item" defaultValue={itemId} className="input">
            <option value="">{I.allItems}</option>
            {items.map((i) => (
              <option key={i.id} value={i.id}>
                {lang === "ar" ? i.nameAr : i.nameEn}
              </option>
            ))}
          </select>
        </div>
        <button type="submit" className="btn-secondary">
          {t.common.search}
        </button>
      </form>

      <div className="card">
        {rows.length === 0 ? (
          <EmptyState message={I.noMovements} icon={null} />
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>{t.common.date}</th>
                  <th>{I.item}</th>
                  <th>{t.inventory.type}</th>
                  <th className="text-end">{I.quantity}</th>
                  <th className="text-end">{I.total}</th>
                  <th>{I.supplier}</th>
                  <th>{I.byLabel}</th>
                  {canManage && <th className="text-end">{t.common.actions}</th>}
                </tr>
              </thead>
              <tbody>
                {rows.map(({ mv, item, by }) => {
                  const unit = t.inventory.units[item.unit];
                  return (
                    <tr key={mv.id}>
                      <td className="whitespace-nowrap text-muted">{formatDateTime(mv.createdAt, lang)}</td>
                      <td>
                        <Link href={`/${lang}/inventory/${item.id}`} className="link">
                          {lang === "ar" ? item.nameAr : item.nameEn}
                        </Link>
                        {item.deletedAt && <span className="badge ms-2 bg-slate-100 text-slate-600">{t.common.inactive}</span>}
                        {mv.note && <span className="block text-xs text-muted">{mv.note}</span>}
                      </td>
                      <td>{t.inventory.reasons[mv.reason]}</td>
                      <td className={`num whitespace-nowrap text-end font-medium ${mv.deltaMilli < 0 ? "text-red-700" : "text-emerald-700"}`} dir="ltr">
                        {mv.deltaMilli > 0 ? "+" : "−"}
                        {formatQty(Math.abs(mv.deltaMilli), lang)} {unit}
                      </td>
                      <td className="num whitespace-nowrap text-end">
                        {mv.totalCostFils != null ? (
                          <>
                            {formatMoney(mv.totalCostFils, lang)}
                            {mv.paidWith && <span className="block text-xs text-muted">{t.invoices.methods[mv.paidWith]}</span>}
                          </>
                        ) : (
                          <span className="text-muted">{mv.reason === "restock" ? I.noPrice : "—"}</span>
                        )}
                      </td>
                      <td className="text-muted">{mv.supplier ?? "—"}</td>
                      <td className="text-muted">{by ?? "—"}</td>
                      {canManage && (
                        <td className="text-end">
                          {!item.deletedAt && (
                            <Link href={`/${lang}/inventory/movements/${mv.id}`} className="btn-ghost min-h-8 px-2 text-xs">
                              {t.common.edit}
                            </Link>
                          )}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
