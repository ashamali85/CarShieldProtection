import { Suspense } from "react";
import { asc, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { pageContext } from "@/lib/page";
import { PageHeader, PageSkeleton } from "@/components/ui";
import { EmployeeForm } from "@/components/hr/employee-form";

export default function NewEmployeePage(props: PageProps<"/[lang]/hr/employees/new">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <NewEmployee {...props} />
    </Suspense>
  );
}

async function NewEmployee({ params }: PageProps<"/[lang]/hr/employees/new">) {
  const { lang, t } = await pageContext(params, { perm: "hr.manage" });
  const db = await getDb();
  const users = await db.select({ id: schema.users.id, name: schema.users.name }).from(schema.users).where(eq(schema.users.active, true)).orderBy(asc(schema.users.name));
  return (
    <>
      <PageHeader title={t.hr.employees.new} back={{ href: `/${lang}/hr/employees`, label: t.hr.employees.title }} />
      <div className="card card-pad max-w-3xl">
        <EmployeeForm lang={lang} t={t} users={users} />
      </div>
    </>
  );
}
