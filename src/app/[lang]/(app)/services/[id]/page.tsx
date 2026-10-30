import { Suspense } from "react";
import Link from "next/link";
import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { getDb, schema } from "@/db";
import { formatQty } from "@/i18n";
import { pageContext } from "@/lib/page";
import { UUID_RE } from "@/lib/actions/helpers";
import { removeServiceMaterial, setServiceMaterial } from "@/lib/actions/inventory";
import { ActionForm, SubmitButton } from "@/components/forms";
import { PageHeader, PageSkeleton } from "@/components/ui";
import { ServiceForm } from "@/components/service-form";

export default function EditServicePage(props: PageProps<"/[lang]/services/[id]">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <EditService {...props} />
    </Suspense>
  );
}

async function EditService({ params }: PageProps<"/[lang]/services/[id]">) {
  const { lang, t } = await pageContext(params, { admin: true });
  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();
  const db = await getDb();
  const [service] = await db.select().from(schema.services).where(eq(schema.services.id, id)).limit(1);
  if (!service) notFound();

  const [materials, items] = await Promise.all([
    db
      .select({ material: schema.serviceMaterials, item: schema.inventoryItems })
      .from(schema.serviceMaterials)
      .innerJoin(schema.inventoryItems, eq(schema.serviceMaterials.itemId, schema.inventoryItems.id))
      .where(eq(schema.serviceMaterials.serviceId, id))
      .orderBy(schema.inventoryItems.nameEn),
    db.select().from(schema.inventoryItems).where(eq(schema.inventoryItems.active, true)).orderBy(schema.inventoryItems.nameEn),
  ]);
  const itemName = (i: { nameEn: string; nameAr: string }) => (lang === "ar" ? i.nameAr : i.nameEn);

  return (
    <>
      <PageHeader title={itemName(service)} back={{ href: `/${lang}/services`, label: t.services.title }} />
      <div className="grid max-w-2xl gap-6">
        <div className="card card-pad">
          <ServiceForm lang={lang} t={t} service={service} />
        </div>

        <section className="card" id="materials">
          <div className="border-b border-line px-4 py-3 sm:px-6">
            <h2 className="section-title">{t.inventory.materials}</h2>
            <p className="mt-0.5 text-sm text-muted">{t.inventory.materialsHint}</p>
          </div>
          {materials.length === 0 ? (
            <p className="px-4 py-4 text-sm text-muted sm:px-6">{t.inventory.noMaterials}</p>
          ) : (
            <ul>
              {materials.map(({ material: m, item }) => (
                <li key={m.id} className="flex items-center justify-between gap-3 border-b border-line px-4 py-3 text-sm last:border-b-0 sm:px-6">
                  <Link href={`/${lang}/inventory/${item.id}`} className="link min-w-0 truncate">
                    {itemName(item)}
                  </Link>
                  <span className="flex items-center gap-2">
                    <span className="num">
                      {formatQty(m.quantityMilli, lang)} {t.inventory.units[item.unit]}
                    </span>
                    <form action={removeServiceMaterial}>
                      <input type="hidden" name="lang" value={lang} />
                      <input type="hidden" name="id" value={m.id} />
                      <input type="hidden" name="serviceId" value={id} />
                      <button type="submit" className="btn-ghost px-2 text-red-700" aria-label={`${t.common.cancel}: ${itemName(item)}`}>
                        ×
                      </button>
                    </form>
                  </span>
                </li>
              ))}
            </ul>
          )}
          <div className="border-t border-line px-4 py-4 sm:px-6">
            {items.length === 0 ? (
              <p className="text-sm text-muted">
                {t.inventory.empty}{" "}
                <Link href={`/${lang}/inventory/new`} className="link">
                  {t.inventory.new}
                </Link>
              </p>
            ) : (
              <ActionForm action={setServiceMaterial} hidden={{ lang, serviceId: id }} className="flex flex-wrap items-end gap-2">
                <div className="min-w-48 flex-1">
                  <label htmlFor="f-item" className="label">
                    {t.inventory.addMaterial}
                  </label>
                  <select id="f-item" name="itemId" className="input" required defaultValue="">
                    <option value="" disabled>
                      {t.inventory.chooseItem}
                    </option>
                    {items.map((i) => (
                      <option key={i.id} value={i.id}>
                        {itemName(i)} ({t.inventory.units[i.unit]})
                      </option>
                    ))}
                  </select>
                </div>
                <div className="w-32">
                  <label htmlFor="f-qty" className="label">
                    {t.inventory.perService}
                  </label>
                  <input id="f-qty" name="quantity" className="input" inputMode="decimal" dir="ltr" required placeholder="1" />
                </div>
                <SubmitButton className="btn-secondary">{t.common.add}</SubmitButton>
              </ActionForm>
            )}
          </div>
        </section>
      </div>
    </>
  );
}
