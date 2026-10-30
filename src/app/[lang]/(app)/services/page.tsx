import { Suspense } from "react";
import Link from "next/link";
import { getDb, schema } from "@/db";
import { formatMoney } from "@/i18n";
import { pageContext } from "@/lib/page";
import { EmptyState, PageHeader, PageSkeleton } from "@/components/ui";

export default function ServicesPage(props: PageProps<"/[lang]/services">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Services {...props} />
    </Suspense>
  );
}

async function Services({ params }: PageProps<"/[lang]/services">) {
  const { lang, t, user } = await pageContext(params);
  const isAdmin = user.role === "admin";
  const db = await getDb();
  const rows = await db.select().from(schema.services).orderBy(schema.services.category, schema.services.nameEn);

  return (
    <>
      <PageHeader
        title={t.services.title}
        actions={
          isAdmin && (
            <Link href={`/${lang}/services/new`} className="btn-primary">
              {t.services.new}
            </Link>
          )
        }
      />
      <div className="card">
        {rows.length === 0 ? (
          <EmptyState message={t.services.empty} />
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>{t.users.name}</th>
                  <th>{t.services.category}</th>
                  <th className="text-end">{t.services.price.replace(/\s*\(.*\)/, "")}</th>
                  <th>{t.services.warranty.replace(/\s*\(.*\)/, "")}</th>
                  <th>{t.common.status}</th>
                  {isAdmin && (
                    <th>
                      <span className="sr-only">{t.common.actions}</span>
                    </th>
                  )}
                </tr>
              </thead>
              <tbody>
                {rows.map((s) => (
                  <tr key={s.id} className={s.active ? "" : "text-muted"}>
                    <td>
                      <span className="block font-medium">{lang === "ar" ? s.nameAr : s.nameEn}</span>
                      <span className="block text-xs text-muted" lang={lang === "ar" ? "en" : "ar"}>
                        {lang === "ar" ? s.nameEn : s.nameAr}
                      </span>
                    </td>
                    <td>{t.services.categories[s.category]}</td>
                    <td className="num text-end whitespace-nowrap">{formatMoney(s.priceFils, lang)}</td>
                    <td>{s.warrantyMonths > 0 ? `${s.warrantyMonths} ${t.common.months}` : t.services.noWarranty}</td>
                    <td>
                      <span className={`badge ${s.active ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-600"}`}>
                        {s.active ? t.common.active : t.common.inactive}
                      </span>
                    </td>
                    {isAdmin && (
                      <td className="text-end">
                        <Link href={`/${lang}/services/${s.id}`} className="link text-sm">
                          {t.common.edit}
                        </Link>
                      </td>
                    )}
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
