import { Suspense } from "react";
import Link from "next/link";
import { and, asc, eq, ilike, or } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { formatDate, formatMoney } from "@/i18n";
import { first, pageContext } from "@/lib/page";
import { monthlyWage } from "@/lib/hr";
import { EmptyState, PageHeader, PageSkeleton } from "@/components/ui";
import { EmployeeStatusBadge } from "@/components/hr/ui";

export default function EmployeesPage(props: PageProps<"/[lang]/hr/employees">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Employees {...props} />
    </Suspense>
  );
}

async function Employees({ params, searchParams }: PageProps<"/[lang]/hr/employees">) {
  const { lang, t } = await pageContext(params, { admin: true });
  const sp = await searchParams;
  const q = first(sp.q);
  const former = first(sp.show) === "former";
  const E = t.hr.employees;
  const db = await getDb();
  const like = `%${q}%`;
  const rows = await db
    .select()
    .from(schema.employees)
    .where(
      and(
        eq(schema.employees.status, former ? "terminated" : "active"),
        q
          ? or(
              ilike(schema.employees.fullName, like),
              ilike(schema.employees.fullNameAr, like),
              ilike(schema.employees.jobTitle, like),
              ilike(schema.employees.civilId, like),
              ilike(schema.employees.phone, like),
            )
          : undefined,
      ),
    )
    .orderBy(asc(schema.employees.code));

  const tab = (href: string, label: string, active: boolean) => (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`inline-flex min-h-9 items-center rounded-full border px-3 text-sm ${active ? "border-brand-600 bg-brand-600 text-white" : "border-line bg-white text-muted hover:text-ink"}`}
    >
      {label}
    </Link>
  );

  return (
    <>
      <PageHeader
        title={E.title}
        actions={
          <Link href={`/${lang}/hr/employees/new`} className="btn-primary">
            {E.new}
          </Link>
        }
      />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {tab(`/${lang}/hr/employees`, E.active, !former)}
        {tab(`/${lang}/hr/employees?show=former`, E.former, former)}
        <form role="search" className="ms-auto flex w-full gap-2 sm:w-auto">
          {former && <input type="hidden" name="show" value="former" />}
          <label htmlFor="q" className="sr-only">
            {E.search}
          </label>
          <input id="q" name="q" type="search" defaultValue={q} placeholder={E.search} className="input sm:w-72" />
          <button type="submit" className="btn-secondary">
            {t.common.search}
          </button>
        </form>
      </div>
      <div className="card">
        {rows.length === 0 ? (
          <EmptyState
            icon={null}
            message={q || former ? E.emptyFilter : E.empty}
            action={
              !q &&
              !former && (
                <Link href={`/${lang}/hr/employees/new`} className="btn-primary">
                  {E.new}
                </Link>
              )
            }
          />
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>{E.code}</th>
                  <th>{t.users.name}</th>
                  <th>{E.jobTitle}</th>
                  <th>{E.nationality}</th>
                  <th>{E.hireDate}</th>
                  <th className="text-end">{E.wage}</th>
                  <th>{t.common.status}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((e) => (
                  <tr key={e.id}>
                    <td className="num text-muted">{e.code}</td>
                    <td>
                      <Link href={`/${lang}/hr/employees/${e.id}`} className="link auto-dir" dir="auto">
                        {lang === "ar" && e.fullNameAr ? e.fullNameAr : e.fullName}
                      </Link>
                      {e.fullNameAr && (
                        <span className="block text-xs text-muted auto-dir" dir="auto">
                          {lang === "ar" ? e.fullName : e.fullNameAr}
                        </span>
                      )}
                    </td>
                    <td>
                      {e.jobTitle}
                      {e.department && <span className="block text-xs text-muted">{e.department}</span>}
                    </td>
                    <td>
                      {e.nationality}
                      {e.isKuwaiti && <span className="badge ms-1.5 bg-brand-50 text-brand-700">PIFSS</span>}
                    </td>
                    <td className="num whitespace-nowrap">{formatDate(e.hireDate, lang)}</td>
                    <td className="num text-end">{formatMoney(monthlyWage(e), lang)}</td>
                    <td>
                      <EmployeeStatusBadge status={e.status} t={t} />
                    </td>
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
