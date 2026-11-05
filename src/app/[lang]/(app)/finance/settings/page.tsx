import { Suspense } from "react";
import { asc } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { pageContext } from "@/lib/page";
import { getFinanceSettings } from "@/lib/finance";
import { PageHeader, PageSkeleton } from "@/components/ui";
import { AddCategory, CategoryItem, OpeningForm } from "@/components/finance/settings-forms";

export default function FinanceSettingsPage(props: PageProps<"/[lang]/finance/settings">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Settings {...props} />
    </Suspense>
  );
}

async function Settings({ params }: PageProps<"/[lang]/finance/settings">) {
  const { lang, t } = await pageContext(params, { admin: true });
  const S = t.finance.settings;
  const db = await getDb();
  const [settings, categories] = await Promise.all([
    getFinanceSettings(db),
    db.select().from(schema.expenseCategories).orderBy(asc(schema.expenseCategories.sortOrder), asc(schema.expenseCategories.nameEn)),
  ]);
  const text = {
    ...S,
    kinds: S.kinds,
    save: t.common.save,
    saving: t.common.saving,
    cancel: t.common.cancel,
    edit: t.common.edit,
    active: t.common.active,
    inactive: t.common.inactive,
    nameEn: t.inventory.nameEn,
    nameAr: t.inventory.nameAr,
  };
  return (
    <>
      <PageHeader title={S.title} />
      <div className="grid gap-6 xl:grid-cols-2">
        <section className="card card-pad content-start">
          <h2 className="section-title">{S.opening}</h2>
          <p className="hint mb-4">{S.openingHint}</p>
          <OpeningForm lang={lang} cash={settings.openingCashFils} date={settings.openingDate} text={text} />
        </section>
        <div className="grid min-w-0 content-start gap-4 [&>*]:min-w-0">
          <section className="card">
            <div className="border-b border-line px-4 py-3.5 sm:px-6">
              <h2 className="section-title">{S.categories}</h2>
              <p className="hint">{S.categoriesHint}</p>
            </div>
            <ul>
              {categories.map((c) => (
                <CategoryItem
                  key={c.id}
                  lang={lang}
                  title={lang === "ar" ? c.nameAr : c.nameEn}
                  row={{ id: c.id, nameEn: c.nameEn, nameAr: c.nameAr, kind: c.kind, active: c.active }}
                  text={text}
                />
              ))}
            </ul>
          </section>
          <div>
            <AddCategory lang={lang} text={text} />
          </div>
        </div>
      </div>
    </>
  );
}
