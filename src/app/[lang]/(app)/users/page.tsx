import { Suspense } from "react";
import { getDb, schema } from "@/db";
import { pageContext } from "@/lib/page";
import { asc } from "drizzle-orm";
import { can } from "@/lib/auth";
import { canGrant } from "@/lib/roles";
import { createUser, toggleUserActive } from "@/lib/actions/admin";
import { setUserRole } from "@/lib/actions/roles";
import { UserTabs } from "@/components/area-tabs";
import { ActionForm, Field, SubmitButton } from "@/components/forms";
import { PageHeader, PageSkeleton } from "@/components/ui";

export default function UsersPage(props: PageProps<"/[lang]/users">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Users {...props} />
    </Suspense>
  );
}

async function Users({ params }: PageProps<"/[lang]/users">) {
  const { lang, t, user: me } = await pageContext(params, { perm: "users.manage" });
  const db = await getDb();
  const [rows, roles] = await Promise.all([
    db
      .select({ id: schema.users.id, name: schema.users.name, email: schema.users.email, active: schema.users.active, roleId: schema.users.roleId })
      .from(schema.users)
      .orderBy(schema.users.name),
    db.select().from(schema.roles).orderBy(asc(schema.roles.createdAt)),
  ]);
  const roleById = new Map(roles.map((r) => [r.id, r]));
  const roleName = (id: string) => {
    const r = roleById.get(id);
    return r ? (lang === "ar" ? r.nameAr : r.nameEn) : "—";
  };
  // Only roles within your own access can be given; the built-in Admin role comes first.
  const grantable = roles.filter((r) => canGrant(me, r)).sort((a, b) => Number(b.system) - Number(a.system));
  const defaultRole = grantable.find((r) => r.key === "staff") ?? grantable.find((r) => !r.system) ?? grantable[0];

  return (
    <>
      <UserTabs lang={lang} t={t} current="users" users roles={can(me, "roles.manage")} />
      <PageHeader title={t.users.title} />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="card min-w-0 lg:col-span-2">
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>{t.users.name}</th>
                  <th>{t.users.role}</th>
                  <th>{t.common.status}</th>
                  <th>
                    <span className="sr-only">{t.common.actions}</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((u) => (
                  <tr key={u.id}>
                    <td>
                      <span className="block font-medium">
                        {u.name} {u.id === me.id && <span className="text-xs font-normal text-muted">({t.users.you})</span>}
                      </span>
                      <span className="block text-xs text-muted" dir="ltr">
                        <span className="block text-start">{u.email}</span>
                      </span>
                    </td>
                    <td>
                      {u.id !== me.id && roleById.get(u.roleId) && canGrant(me, roleById.get(u.roleId)!) ? (
                        <ActionForm action={setUserRole} hidden={{ lang, id: u.id }} resetOnSuccess={false} className="flex items-center gap-1.5">
                          <label htmlFor={`role-${u.id}`} className="sr-only">
                            {t.users.changeRole}
                          </label>
                          <select id={`role-${u.id}`} name="roleId" defaultValue={u.roleId} className="input min-h-9 w-auto py-1 text-sm">
                            {grantable.map((r) => (
                              <option key={r.id} value={r.id}>
                                {lang === "ar" ? r.nameAr : r.nameEn}
                              </option>
                            ))}
                          </select>
                          <SubmitButton className="btn-ghost min-h-9 px-2 text-xs" pendingLabel={t.common.saving}>
                            {t.common.save}
                          </SubmitButton>
                        </ActionForm>
                      ) : (
                        roleName(u.roleId)
                      )}
                    </td>
                    <td>
                      <span className={`badge ${u.active ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-600"}`}>
                        {u.active ? t.common.active : t.common.inactive}
                      </span>
                    </td>
                    <td className="text-end">
                      {u.id !== me.id && roleById.get(u.roleId) && canGrant(me, roleById.get(u.roleId)!) && (
                        <form action={toggleUserActive}>
                          <input type="hidden" name="lang" value={lang} />
                          <input type="hidden" name="id" value={u.id} />
                          <SubmitButton className={u.active ? "btn-ghost text-xs text-red-700" : "btn-ghost text-xs"}>
                            {u.active ? t.users.deactivate : t.users.activate}
                          </SubmitButton>
                        </form>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <section className="card card-pad content-start">
          <h2 className="section-title mb-4">{t.users.new}</h2>
          <ActionForm action={createUser} hidden={{ lang }} className="space-y-4">
            <Field label={t.users.name} name="name" required autoComplete="off" />
            <Field label={t.users.email} name="email" type="email" required dir="ltr" autoComplete="off" />
            <Field
              label={t.users.password}
              name="password"
              type="password"
              required
              minLength={8}
              dir="ltr"
              autoComplete="new-password"
              hint={t.users.passwordHint}
            />
            <div>
              <label htmlFor="f-role" className="label">
                {t.users.role}
              </label>
              <select id="f-role" name="roleId" className="input" defaultValue={defaultRole?.id}>
                {grantable.map((r) => (
                  <option key={r.id} value={r.id}>
                    {lang === "ar" ? r.nameAr : r.nameEn}
                  </option>
                ))}
              </select>
            </div>
            <SubmitButton className="btn-primary w-full" pendingLabel={t.common.saving}>
              {t.users.new}
            </SubmitButton>
          </ActionForm>
        </section>
      </div>
    </>
  );
}
