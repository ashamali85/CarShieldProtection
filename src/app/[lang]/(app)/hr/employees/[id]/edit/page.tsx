import { Suspense } from "react";
import { asc, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { getDb, schema } from "@/db";
import { pageContext } from "@/lib/page";
import { UUID_RE } from "@/lib/actions/helpers";
import { PageHeader, PageSkeleton } from "@/components/ui";
import { EmployeeForm } from "@/components/hr/employee-form";

export default function EditEmployeePage(props: PageProps<"/[lang]/hr/employees/[id]/edit">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <EditEmployee {...props} />
    </Suspense>
  );
}

async function EditEmployee({ params }: PageProps<"/[lang]/hr/employees/[id]/edit">) {
  const { lang, t } = await pageContext(params, { perm: "hr.manage" });
  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();
  const db = await getDb();
  const [[employee], users] = await Promise.all([
    db.select().from(schema.employees).where(eq(schema.employees.id, id)).limit(1),
    db.select({ id: schema.users.id, name: schema.users.name }).from(schema.users).where(eq(schema.users.active, true)).orderBy(asc(schema.users.name)),
  ]);
  if (!employee) notFound();
  return (
    <>
      <PageHeader title={t.hr.employees.edit} back={{ href: `/${lang}/hr/employees/${id}`, label: employee.fullName }} />
      <div className="card card-pad max-w-3xl">
        <EmployeeForm lang={lang} t={t} employee={employee} users={users} />
      </div>
    </>
  );
}
