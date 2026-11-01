import { Suspense } from "react";
import { and, count, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { formatNumber } from "@/i18n";
import { first, pageContext } from "@/lib/page";
import { addMake } from "@/lib/actions/catalog";
import { ActionForm, Field, SubmitButton } from "@/components/forms";
import { PageHeader, PageSkeleton } from "@/components/ui";
import { BrandSearch } from "@/components/brand-search";
import { brandLogoSrc } from "@/lib/brand-logos";

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

  const makes = await db
    .select({
      id: schema.carMakes.id,
      name: schema.carMakes.name,
      nameAr: schema.carMakes.nameAr,
      logoUrl: schema.carMakes.logoUrl,
      active: schema.carMakes.active,
      models: count(schema.carModels.id),
    })
    .from(schema.carMakes)
    .leftJoin(schema.carModels, and(eq(schema.carModels.makeId, schema.carMakes.id), eq(schema.carModels.active, true)))
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
        <div className="min-w-0 lg:col-span-2">
          <BrandSearch
            lang={lang}
            initialQuery={q}
            brands={makes.map((m) => ({
              id: m.id,
              name: m.name,
              nameAr: m.nameAr,
              logo: brandLogoSrc(m.name, m.logoUrl),
              active: m.active,
              models: formatNumber(m.models, lang),
            }))}
            labels={{
              search: t.catalog.search,
              clear: t.catalog.clearSearch,
              noMatch: t.catalog.noMatch,
              results: t.catalog.matches,
              modelsCount: t.vehicles.modelsCount,
            }}
          />
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
