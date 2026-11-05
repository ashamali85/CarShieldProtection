import { Suspense } from "react";
import Link from "next/link";
import { asc } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { formatDate, formatMoney } from "@/i18n";
import { pageContext } from "@/lib/page";
import { todayKuwait } from "@/lib/dates";
import { contractStatuses } from "@/lib/finance";
import { EmptyState, PageHeader, PageSkeleton } from "@/components/ui";
import { ContractBadge, ContractForm } from "@/components/finance/contract-form";

export default function ContractsPage(props: PageProps<"/[lang]/finance/contracts">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Contracts {...props} />
    </Suspense>
  );
}

async function Contracts({ params }: PageProps<"/[lang]/finance/contracts">) {
  const { lang, t } = await pageContext(params, { admin: true });
  const C = t.finance.contracts;
  const today = todayKuwait();
  const db = await getDb();
  const [rows, categories] = await Promise.all([
    contractStatuses(db, today),
    db.select().from(schema.expenseCategories).orderBy(asc(schema.expenseCategories.sortOrder), asc(schema.expenseCategories.nameEn)),
  ]);
  const money = (f: number) => formatMoney(Math.round(f), lang);
  const catName = (id: string) => {
    const c = categories.find((x) => x.id === id);
    return c ? (lang === "ar" ? c.nameAr : c.nameEn) : "";
  };
  // Running contracts first, ended ones after.
  const sorted = [...rows].sort((a, b) => Number(a.ended) - Number(b.ended));

  return (
    <>
      <PageHeader title={C.title} subtitle={C.subtitle} />
      <div className="grid gap-6 lg:grid-cols-3">
        <section className="card min-w-0 content-start lg:col-span-2">
          {sorted.length === 0 ? (
            <EmptyState icon="calendar" message={C.empty} />
          ) : (
            <div className="table-wrap">
              <table className="table min-w-[42rem]">
                <thead>
                  <tr>
                    <th>{C.name}</th>
                    <th className="text-end">{C.monthlyShort}</th>
                    <th className="text-end">{C.dueSoFar}</th>
                    <th className="text-end">{C.paid}</th>
                    <th>{C.status}</th>
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((r) => (
                    <tr key={r.id} className={r.ended ? "text-muted" : undefined}>
                      <td>
                        <Link href={`/${lang}/finance/contracts/${r.id}`} className="link font-medium">
                          <span dir="auto">{r.name}</span>
                        </Link>
                        <span className="num block text-xs text-muted">
                          {[catName(r.categoryId), r.vendor, `${formatDate(r.startDate, lang)}${r.endDate ? ` – ${formatDate(r.endDate, lang)}` : ""}`].filter(Boolean).join(" · ")}
                        </span>
                      </td>
                      <td className="num text-end">{money(r.monthly)}</td>
                      <td className="num text-end">{money(r.dueSoFar)}</td>
                      <td className="num text-end">{money(r.paid)}</td>
                      <td>
                        <ContractBadge balance={r.balance} ended={r.ended} money={money} C={C} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
        <section className="card card-pad min-w-0 content-start">
          <h2 className="section-title">{C.add}</h2>
          <p className="hint mb-4">{C.doubleHint}</p>
          <ContractForm lang={lang} t={t} categories={categories} today={today} />
        </section>
      </div>
    </>
  );
}
