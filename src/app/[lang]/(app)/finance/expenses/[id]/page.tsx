import { Suspense } from "react";
import { asc, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { getDb, schema } from "@/db";
import { first, pageContext } from "@/lib/page";
import { todayKuwait } from "@/lib/dates";
import { UUID_RE } from "@/lib/actions/helpers";
import { PageHeader, PageSkeleton } from "@/components/ui";
import { ExpenseForm } from "@/components/finance/expense-form";

export default function EditExpensePage(props: PageProps<"/[lang]/finance/expenses/[id]">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <EditExpense {...props} />
    </Suspense>
  );
}

async function EditExpense({ params, searchParams }: PageProps<"/[lang]/finance/expenses/[id]">) {
  const { lang, t } = await pageContext(params, { perm: "finance.manage" });
  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();
  const raw = first((await searchParams).back);
  const back = raw.startsWith(`/${lang}/finance/`) ? raw : `/${lang}/finance/expenses`;
  const db = await getDb();
  const [[expense], categories] = await Promise.all([
    db.select().from(schema.expenses).where(eq(schema.expenses.id, id)).limit(1),
    db.select().from(schema.expenseCategories).orderBy(asc(schema.expenseCategories.sortOrder)),
  ]);
  if (!expense) notFound();
  return (
    <>
      <PageHeader title={t.finance.expenses.edit} back={{ href: back, label: t.finance.expenses.title }} />
      <div className="card card-pad max-w-xl">
        <ExpenseForm lang={lang} t={t} categories={categories} today={todayKuwait()} expense={expense} back={back} />
      </div>
    </>
  );
}
