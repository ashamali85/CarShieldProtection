import { Suspense } from "react";
import Link from "next/link";
import { asc, count, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { formatNumber } from "@/i18n";
import { can } from "@/lib/auth";
import { pageContext } from "@/lib/page";
import { canGrant } from "@/lib/roles";
import { ALL_PERMISSIONS, PERMISSION_AREAS, normalizePermissions } from "@/lib/permissions";
import { saveRole } from "@/lib/actions/roles";
import { ActionForm, Field, SubmitButton } from "@/components/forms";
import { PageHeader, PageSkeleton } from "@/components/ui";
import { UserTabs } from "@/components/area-tabs";

export default function RolesPage(props: PageProps<"/[lang]/roles">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Roles {...props} />
    </Suspense>
  );
}

async function Roles({ params }: PageProps<"/[lang]/roles">) {
  const { lang, t, user: me } = await pageContext(params, { perm: "roles.manage" });
  const R = t.roles;
  const db = await getDb();
  const [roles, counts] = await Promise.all([
    db.select().from(schema.roles).orderBy(asc(schema.roles.createdAt)),
    db.select({ roleId: schema.users.roleId, n: count() }).from(schema.users).where(eq(schema.users.active, true)).groupBy(schema.users.roleId),
  ]);
  const usersBy = new Map(counts.map((c) => [c.roleId, c.n]));
  const name = (r: (typeof roles)[number]) => (lang === "ar" ? r.nameAr : r.nameEn);
  // Roles first by the built-in Admin, then the rest in the order they were made.
  const sorted = [...roles].sort((a, b) => Number(b.system) - Number(a.system));

  return (
    <>
      <UserTabs lang={lang} t={t} current="roles" users={can(me, "users.manage")} roles />
      <PageHeader title={R.title} subtitle={R.subtitle} />
      <div className="grid gap-6 lg:grid-cols-3">
        <section className="card min-w-0 content-start lg:col-span-2">
          <ul>
            {sorted.map((r) => {
              const perms = r.system ? ALL_PERMISSIONS : normalizePermissions(r.permissions);
              const areas = PERMISSION_AREAS.filter((a) => a.perms.some((p) => perms.includes(p)));
              return (
                <li key={r.id} className="border-b border-line px-4 py-4 last:border-b-0 sm:px-6">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                    <Link href={`/${lang}/roles/${r.id}`} className="link font-medium">
                      <span dir="auto">{name(r)}</span>
                    </Link>
                    <span className="text-sm text-muted">
                      {R.users}: <span className="num">{formatNumber(usersBy.get(r.id) ?? 0, lang)}</span>
                    </span>
                  </div>
                  <p className="mt-1.5 flex flex-wrap gap-1.5">
                    {r.system ? (
                      <span className="badge bg-brand-50 text-brand-800">{R.full}</span>
                    ) : areas.length === 0 ? (
                      <span className="badge bg-slate-100 text-slate-600">{R.noAccess}</span>
                    ) : (
                      areas.map((a) => {
                        const manages = a.perms.some((p) => !p.endsWith(".view") && perms.includes(p));
                        return (
                          <span key={a.area} className={`badge ${manages ? "bg-emerald-50 text-emerald-800" : "bg-slate-100 text-slate-700"}`}>
                            {R.areas[a.area]}
                            {!manages && ` · ${R.perms["jobs.view"]}`}
                          </span>
                        );
                      })
                    )}
                  </p>
                </li>
              );
            })}
          </ul>
        </section>
        <section className="card card-pad min-w-0 content-start">
          <h2 className="section-title mb-4">{R.new}</h2>
          <ActionForm action={saveRole} hidden={{ lang }} className="space-y-4">
            <Field label={R.nameEn} name="nameEn" required />
            <Field label={R.nameAr} name="nameAr" required dir="rtl" />
            <div>
              <label htmlFor="f-copyFrom" className="label">
                {R.copyFrom}
              </label>
              <select id="f-copyFrom" name="copyFrom" className="input" defaultValue="">
                <option value="">{R.blank}</option>
                {sorted
                  .filter((r) => canGrant(me, r))
                  .map((r) => (
                    <option key={r.id} value={r.id}>
                      {name(r)}
                    </option>
                  ))}
              </select>
            </div>
            <SubmitButton className="btn-primary w-full" pendingLabel={t.common.saving}>
              {R.new}
            </SubmitButton>
          </ActionForm>
        </section>
      </div>
    </>
  );
}
