import { Suspense } from "react";
import { asc, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { first, pageContext } from "@/lib/page";
import { UUID_RE } from "@/lib/actions/helpers";
import { PageHeader, PageSkeleton } from "@/components/ui";
import { LeaveForm } from "@/components/hr/leave-form";

export default function NewLeavePage(props: PageProps<"/[lang]/hr/leave/new">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <NewLeave {...props} />
    </Suspense>
  );
}

async function NewLeave({ params, searchParams }: PageProps<"/[lang]/hr/leave/new">) {
  const { lang, t } = await pageContext(params, { perm: "hr.manage" });
  const pre = first((await searchParams).employee);
  const db = await getDb();
  const [emps, types] = await Promise.all([
    db
      .select({ id: schema.employees.id, fullName: schema.employees.fullName, fullNameAr: schema.employees.fullNameAr, gender: schema.employees.gender })
      .from(schema.employees)
      .where(eq(schema.employees.status, "active"))
      .orderBy(asc(schema.employees.fullName)),
    db.select().from(schema.leaveTypes).where(eq(schema.leaveTypes.active, true)).orderBy(asc(schema.leaveTypes.sortOrder)),
  ]);
  const L = t.hr.leave;
  const initial = UUID_RE.test(pre) && emps.some((e) => e.id === pre) ? pre : "";
  const back = initial ? `/${lang}/hr/employees/${initial}` : `/${lang}/hr/leave`;
  return (
    <>
      <PageHeader title={L.record} back={{ href: back, label: initial ? t.hr.employees.title : L.title }} />
      <div className="card card-pad max-w-2xl">
        <LeaveForm
          lang={lang}
          back={back}
          initialEmployee={initial}
          employees={emps.map((e) => ({ id: e.id, name: lang === "ar" && e.fullNameAr ? e.fullNameAr : e.fullName, gender: e.gender }))}
          types={types.map((ty) => ({ id: ty.id, name: lang === "ar" ? ty.nameAr : ty.nameEn, femaleOnly: ty.femaleOnly }))}
          labels={{
            employee: L.employee,
            chooseEmployee: L.chooseEmployee,
            type: L.type,
            start: L.start,
            end: L.end,
            days: L.days,
            daysHint: L.daysHint,
            reason: L.reason,
            saveAs: L.saveAs,
            approved: L.status.approved,
            pending: L.status.pending,
            save: t.common.save,
            saving: t.common.saving,
            cancel: t.common.cancel,
            optional: t.common.optional,
          }}
        />
      </div>
    </>
  );
}
