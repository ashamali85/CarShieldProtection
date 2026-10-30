import { Suspense } from "react";
import Link from "next/link";
import { and, count, eq, ilike, or } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { formatNumber } from "@/i18n";
import { first, pageContext } from "@/lib/page";
import { addMake } from "@/lib/actions/catalog";
import { ActionForm, Field, SubmitButton } from "@/components/forms";
import { EmptyState, PageHeader, PageSkeleton } from "@/components/ui";

export default function CatalogPage(props: PageProps<"/[lang]/catalog">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Catalog {...props} />
    </Suspense>
  );
}

async function Catalog({ params, searchParams }: PageProps<"/[lang]/catalog">) {
  const { lang, t } = await pageContext(params, { admin: true });
  const q = first((await searchParams).q);
  const db = await getDb();
  const like = `%${q}%`;

  const makes = await db
    .select({
      id: schema.carMakes.id,
      name: schema.carMakes.name,
      nameAr: schema.carMakes.nameAr,
      active: schema.carMakes.active,
      models: count(schema.carModels.id),
    })
    .from(schema.carMakes)
    .leftJoin(schema.carModels, and(eq(schema.carModels.makeId, schema.carMakes.id), eq(schema.carModels.active, true)))
    .where(q ? or(ilike(schema.carMakes.name, like), ilike(schema.carMakes.nameAr, like)) : undefined)
    .groupBy(schema.carMakes.id)
    .orderBy(schema.carMakes.name);

  const totalModels = makes.reduce((a, m) => a + m.models, 0);

  return (
    <>
      <PageHeader
        title={t.catalog.title}
        subtitle={`${t.catalog.subtitle} · ${formatNumber(makes.length, lang)} ${t.catalog.brands} · ${formatNumber(totalModels, lang)} ${t.catalog.models}`}
      />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <form className="mb-4 flex gap-2" role="search">
            <label htmlFor="q" className="sr-only">
              {t.catalog.search}
            </label>
            <input id="q" name="q" defaultValue={q} placeholder={t.catalog.search} className="input max-w-xs" />
            <button type="submit" className="btn-secondary">
              {t.common.search}
            </button>
          </form>
          {makes.length === 0 ? (
            <div className="card">
              <EmptyState message={t.common.none} />
            </div>
          ) : (
            <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {makes.map((m) => (
                <li key={m.id}>
                  <Link
                    href={`/${lang}/catalog/${m.id}`}
                    className={`card flex items-center justify-between gap-3 px-4 py-3 transition-colors hover:border-brand-100 hover:bg-brand-50/40 ${m.active ? "" : "opacity-60"}`}
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{lang === "ar" ? m.nameAr : m.name}</span>
                      <span className="block truncate text-xs text-muted" lang={lang === "ar" ? "en" : "ar"}>
                        {lang === "ar" ? m.name : m.nameAr}
                      </span>
                    </span>
                    <span className="num shrink-0 text-sm text-muted">
                      {formatNumber(m.models, lang)} {t.vehicles.modelsCount}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
        <section className="card card-pad content-start">
          <h2 className="section-title mb-4">{t.catalog.newBrand}</h2>
          <ActionForm action={addMake} hidden={{ lang }} className="space-y-4">
            <Field label={t.catalog.brandEn} name="name" required dir="ltr" autoComplete="off" />
            <Field label={t.catalog.brandAr} name="nameAr" required dir="rtl" lang="ar" autoComplete="off" />
            <SubmitButton className="btn-primary w-full" pendingLabel={t.common.saving}>
              {t.catalog.newBrand}
            </SubmitButton>
          </ActionForm>
        </section>
      </div>
    </>
  );
}
