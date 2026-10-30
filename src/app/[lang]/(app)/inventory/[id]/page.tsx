import { Suspense } from "react";
import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { getDb, schema } from "@/db";
import { formatDateTime, formatMoney, formatQty } from "@/i18n";
import { pageContext } from "@/lib/page";
import { UUID_RE } from "@/lib/actions/helpers";
import { adjustStock, receiveStock } from "@/lib/actions/inventory";
import { ActionForm, Field, SubmitButton } from "@/components/forms";
import { DefinitionList, PageHeader, PageSkeleton } from "@/components/ui";
import { StockLevel } from "@/components/inventory-form";

export default function InventoryItemPage(props: PageProps<"/[lang]/inventory/[id]">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <ItemDetail {...props} />
    </Suspense>
  );
}

async function ItemDetail({ params }: PageProps<"/[lang]/inventory/[id]">) {
  const { lang, t, user } = await pageContext(params);
  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();
  const isAdmin = user.role === "admin";
  const db = await getDb();

  const [item] = await db.select().from(schema.inventoryItems).where(eq(schema.inventoryItems.id, id)).limit(1);
  if (!item) notFound();

  const [usedIn, history] = await Promise.all([
    db
      .select({
        serviceId: schema.services.id,
        nameEn: schema.services.nameEn,
        nameAr: schema.services.nameAr,
        quantityMilli: schema.serviceMaterials.quantityMilli,
      })
      .from(schema.serviceMaterials)
      .innerJoin(schema.services, eq(schema.serviceMaterials.serviceId, schema.services.id))
      .where(eq(schema.serviceMaterials.itemId, id))
      .orderBy(schema.services.nameEn),
    db
      .select({ m: schema.inventoryMovements, by: schema.users.name, jobNumber: schema.jobs.number })
      .from(schema.inventoryMovements)
      .leftJoin(schema.users, eq(schema.inventoryMovements.userId, schema.users.id))
      .leftJoin(schema.jobs, eq(schema.inventoryMovements.jobId, schema.jobs.id))
      .where(eq(schema.inventoryMovements.itemId, id))
      .orderBy(desc(schema.inventoryMovements.createdAt))
      .limit(100),
  ]);

  const name = lang === "ar" ? item.nameAr : item.nameEn;
  const unit = t.inventory.units[item.unit];

  return (
    <>
      <PageHeader
        title={name}
        subtitle={item.sku ? <span className="num" dir="ltr">{item.sku}</span> : undefined}
        back={{ href: `/${lang}/inventory`, label: t.inventory.title }}
        actions={
          isAdmin && (
            <Link href={`/${lang}/inventory/${id}/edit`} className="btn-secondary">
              {t.common.edit}
            </Link>
          )
        }
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="grid content-start gap-6 lg:col-span-2">
          <section className="card card-pad">
            <DefinitionList
              items={[
                {
                  label: t.inventory.onHand,
                  value: <StockLevel onHand={item.onHandMilli} reorder={item.reorderLevelMilli} unit={item.unit} lang={lang} t={t} format={formatQty} />,
                },
                { label: t.inventory.reorderLevel, value: <span className="num">{formatQty(item.reorderLevelMilli, lang)} {unit}</span> },
                { label: t.inventory.unit, value: t.inventory.unitNames[item.unit] },
                {
                  label: t.inventory.unitCost.replace(/\s*\(.*\)/, ""),
                  value: item.unitCostFils != null ? <span className="num">{formatMoney(item.unitCostFils, lang)}</span> : t.common.none,
                },
              ]}
            />
          </section>

          <section className="card">
            <h2 className="section-title border-b border-line px-4 py-3 sm:px-6">{t.inventory.usedIn}</h2>
            {usedIn.length === 0 ? (
              <p className="px-4 py-4 text-sm text-muted sm:px-6">{t.inventory.notUsed}</p>
            ) : (
              <ul>
                {usedIn.map((s) => (
                  <li key={s.serviceId} className="flex items-center justify-between gap-3 border-b border-line px-4 py-3 text-sm last:border-b-0 sm:px-6">
                    {isAdmin ? (
                      <Link href={`/${lang}/services/${s.serviceId}`} className="link">
                        {lang === "ar" ? s.nameAr : s.nameEn}
                      </Link>
                    ) : (
                      <span>{lang === "ar" ? s.nameAr : s.nameEn}</span>
                    )}
                    <span className="num text-muted">
                      {formatQty(s.quantityMilli, lang)} {unit}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="card">
            <h2 className="section-title border-b border-line px-4 py-3 sm:px-6">{t.inventory.history}</h2>
            {history.length === 0 ? (
              <p className="px-4 py-4 text-sm text-muted sm:px-6">{t.inventory.noHistory}</p>
            ) : (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>{t.common.date}</th>
                      <th>{t.inventory.type}</th>
                      <th className="text-end">{t.inventory.change}</th>
                      <th>{t.inventory.by}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.map(({ m, by, jobNumber }) => (
                      <tr key={m.id}>
                        <td className="whitespace-nowrap text-muted">{formatDateTime(m.createdAt, lang)}</td>
                        <td>
                          {t.inventory.reasons[m.reason]}
                          {m.jobId && jobNumber != null && (
                            <>
                              {" "}
                              <Link href={`/${lang}/jobs/${m.jobId}`} className="link num">
                                #{jobNumber}
                              </Link>
                            </>
                          )}
                          {m.note && <span className="block text-xs text-muted">{m.note}</span>}
                        </td>
                        <td className={`num text-end font-medium ${m.deltaMilli < 0 ? "text-red-700" : "text-emerald-700"}`} dir="ltr">
                          {m.deltaMilli > 0 ? "+" : "−"}
                          {formatQty(Math.abs(m.deltaMilli), lang)}
                        </td>
                        <td className="text-muted">{by ?? t.common.none}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>

        <aside className="grid content-start gap-6">
          <section className="card card-pad">
            <h2 className="section-title">{t.inventory.receive}</h2>
            <p className="mb-4 text-sm text-muted">{t.inventory.receiveHint}</p>
            <ActionForm action={receiveStock} hidden={{ lang, itemId: id }} className="space-y-4">
              <Field label={`${t.inventory.quantity} (${unit})`} name="quantity" required inputMode="decimal" dir="ltr" />
              <Field label={t.inventory.note} name="note" optionalLabel={t.common.optional} />
              <SubmitButton className="btn-primary w-full" pendingLabel={t.common.saving}>
                {t.inventory.receive}
              </SubmitButton>
            </ActionForm>
          </section>

          {isAdmin && (
            <section className="card card-pad">
              <h2 className="section-title">{t.inventory.adjust}</h2>
              <p className="mb-4 text-sm text-muted">{t.inventory.adjustHint}</p>
              <ActionForm action={adjustStock} hidden={{ lang, itemId: id }} className="space-y-4">
                <Field
                  label={`${t.inventory.countedQty} (${unit})`}
                  name="counted"
                  required
                  inputMode="decimal"
                  dir="ltr"
                  defaultValue={String(item.onHandMilli / 1000)}
                />
                <Field label={t.inventory.note} name="note" optionalLabel={t.common.optional} />
                <SubmitButton className="btn-secondary w-full" pendingLabel={t.common.saving}>
                  {t.inventory.adjust}
                </SubmitButton>
              </ActionForm>
            </section>
          )}
        </aside>
      </div>
    </>
  );
}
