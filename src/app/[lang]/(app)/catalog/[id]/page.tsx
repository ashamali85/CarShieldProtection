import { Suspense } from "react";
import { asc, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { getDb, schema } from "@/db";
import type { BodyType } from "@/db/schema";
import { pageContext } from "@/lib/page";
import { UUID_RE } from "@/lib/actions/helpers";
import { addModel, toggleMake, toggleModel } from "@/lib/actions/catalog";
import { ActionForm, Field, SubmitButton } from "@/components/forms";
import { EmptyState, PageHeader, PageSkeleton } from "@/components/ui";

const BODY_ORDER: BodyType[] = ["sedan", "suv", "coupe", "convertible", "hatchback", "wagon", "pickup", "minivan", "van"];

export default function CatalogBrandPage(props: PageProps<"/[lang]/catalog/[id]">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Brand {...props} />
    </Suspense>
  );
}

async function Brand({ params }: PageProps<"/[lang]/catalog/[id]">) {
  const { lang, t } = await pageContext(params, { admin: true });
  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();
  const db = await getDb();
  const [make] = await db.select().from(schema.carMakes).where(eq(schema.carMakes.id, id)).limit(1);
  if (!make) notFound();
  const models = await db.select().from(schema.carModels).where(eq(schema.carModels.makeId, id)).orderBy(asc(schema.carModels.name));

  const groups = BODY_ORDER.map((b) => ({ body: b, models: models.filter((m) => m.bodyType === b) })).filter((g) => g.models.length > 0);
  const title = lang === "ar" ? `${make.nameAr} (${make.name})` : `${make.name} (${make.nameAr})`;

  return (
    <>
      <PageHeader
        title={<span className="auto-dir" dir="auto">{title}</span>}
        subtitle={!make.active ? t.catalog.hidden : undefined}
        back={{ href: `/${lang}/catalog`, label: t.catalog.title }}
        actions={
          <form action={toggleMake}>
            <input type="hidden" name="lang" value={lang} />
            <input type="hidden" name="id" value={make.id} />
            <SubmitButton className={make.active ? "btn-secondary" : "btn-primary"}>{make.active ? t.catalog.hide : t.catalog.show}</SubmitButton>
          </form>
        }
      />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="grid content-start gap-6 lg:col-span-2">
          {groups.length === 0 && (
            <div className="card">
              <EmptyState message={t.catalog.empty} />
            </div>
          )}
          {groups.map((g) => (
            <section key={g.body} className="card">
              <h2 className="section-title flex items-center justify-between border-b border-line px-4 py-3 sm:px-6">
                {t.vehicles.bodyTypes[g.body]}
                <span className="num text-sm font-normal text-muted">{g.models.length}</span>
              </h2>
              <ul>
                {g.models.map((m) => (
                  <li key={m.id} className={`flex items-center justify-between gap-3 border-b border-line px-4 py-2.5 text-sm last:border-b-0 sm:px-6 ${m.active ? "" : "text-muted"}`}>
                    <span className="min-w-0" dir="ltr">
                      <span className="block truncate text-start font-medium">{m.name}</span>
                    </span>
                    <span className="flex shrink-0 items-center gap-3">
                      <span className="num text-muted">
                        {m.yearFrom}–{m.yearTo ?? t.catalog.onSale}
                      </span>
                      <form action={toggleModel}>
                        <input type="hidden" name="lang" value={lang} />
                        <input type="hidden" name="id" value={m.id} />
                        <input type="hidden" name="makeId" value={make.id} />
                        <button type="submit" className="btn-ghost min-h-8 px-2 text-xs">
                          {m.active ? t.catalog.hide : t.catalog.show}
                        </button>
                      </form>
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>

        <section className="card card-pad content-start">
          <h2 className="section-title mb-4">{t.catalog.addModel}</h2>
          <ActionForm action={addModel} hidden={{ lang, makeId: make.id }} className="space-y-4">
            <Field label={t.catalog.modelName} name="name" required dir="ltr" autoComplete="off" />
            <fieldset>
              <legend className="label">{t.catalog.bodies}</legend>
              <div className="grid grid-cols-2 gap-1.5">
                {BODY_ORDER.map((b) => (
                  <label key={b} className="flex min-h-9 items-center gap-2 text-sm">
                    <input type="checkbox" name="bodyType" value={b} className="size-4 accent-brand-600" />
                    {t.vehicles.bodyTypes[b]}
                  </label>
                ))}
              </div>
              <p className="hint">{t.catalog.bodiesHint}</p>
            </fieldset>
            <div className="grid grid-cols-2 gap-3">
              <Field label={t.catalog.yearFrom} name="yearFrom" required type="number" min={1950} inputMode="numeric" />
              <Field label={t.catalog.yearTo} name="yearTo" type="number" min={1950} inputMode="numeric" />
            </div>
            <p className="hint -mt-2">{t.catalog.yearToHint}</p>
            <SubmitButton className="btn-primary w-full" pendingLabel={t.common.saving}>
              {t.catalog.addModel}
            </SubmitButton>
          </ActionForm>
        </section>
      </div>
    </>
  );
}
