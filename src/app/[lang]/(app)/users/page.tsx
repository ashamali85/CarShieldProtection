import { Suspense } from "react";
import Link from "next/link";
import { dbFor, getDb, schema, trainingEnabled } from "@/db";
import { pageContext } from "@/lib/page";
import { asc, eq } from "drizzle-orm";
import { can } from "@/lib/auth";
import { canGrant } from "@/lib/roles";
import { createUser, deleteUser, resetUserPassword, toggleUserActive } from "@/lib/actions/admin";
import { RowDelete } from "@/components/finance/row-delete";
import { setUserRole } from "@/lib/actions/roles";
import { UserTabs } from "@/components/area-tabs";
import { ActionForm, Field, SubmitButton } from "@/components/forms";
import { PageHeader, PageSkeleton } from "@/components/ui";
import { currentMode } from "@/lib/session-token";
import { refreshTraining } from "@/lib/actions/training";
import type { Dictionary, Locale } from "@/i18n";

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
                      {u.id === me.id ? (
                        <Link href={`/${lang}/account`} className="btn-ghost text-xs">
                          {t.users.changePassword}
                        </Link>
                      ) : (
                        roleById.get(u.roleId) &&
                        canGrant(me, roleById.get(u.roleId)!) && (
                          <div className="flex flex-wrap items-start justify-end gap-1">
                            <details className="group">
                              <summary className="btn-ghost cursor-pointer list-none text-xs [&::-webkit-details-marker]:hidden">{t.users.resetPassword}</summary>
                              <ActionForm
                                action={resetUserPassword}
                                hidden={{ lang, id: u.id }}
                                successMessage={t.users.passwordReset}
                                className="mt-2 flex w-64 flex-col gap-2 text-start"
                              >
                                <label htmlFor={`pw-${u.id}`} className="label mb-0">
                                  {t.users.newPassword}
                                </label>
                                <input id={`pw-${u.id}`} name="password" type="password" minLength={8} required autoComplete="new-password" dir="ltr" className="input" />
                                <SubmitButton className="btn-secondary min-h-9 text-xs" pendingLabel={t.common.saving}>
                                  {t.users.resetPassword}
                                </SubmitButton>
                              </ActionForm>
                            </details>
                            <form action={toggleUserActive}>
                              <input type="hidden" name="lang" value={lang} />
                              <input type="hidden" name="id" value={u.id} />
                              <SubmitButton className={u.active ? "btn-ghost text-xs text-red-700" : "btn-ghost text-xs"}>
                                {u.active ? t.users.deactivate : t.users.activate}
                              </SubmitButton>
                            </form>
                            <RowDelete
                              action={deleteUser}
                              hidden={{ lang, id: u.id }}
                              labels={{ delete: t.users.delete, confirm: t.users.deleteConfirm.replace("{name}", u.name), cancel: t.common.cancel, saving: t.common.saving }}
                            />
                          </div>
                        )
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
      {me.isAdmin && (await currentMode()) === "live" && trainingEnabled() && <TrainingCard lang={lang} t={t} />}
    </>
  );
}

/** Admins of the real shop: who the demo accounts are, and a button to refresh the practice copy. */
async function TrainingCard({ lang, t }: { lang: Locale; t: Dictionary }) {
  const T = t.training;
  const training = await dbFor("training");
  const demo = await training
    .select({ name: schema.users.name, email: schema.users.email, roleEn: schema.roles.nameEn, roleAr: schema.roles.nameAr })
    .from(schema.users)
    .innerJoin(schema.roles, eq(schema.roles.id, schema.users.roleId))
    .where(eq(schema.users.active, true))
    .orderBy(schema.users.email);
  return (
    <section className="card card-pad mt-6 border-amber-200">
      <div className="flex flex-wrap items-center gap-2">
        <span className="badge bg-amber-500 text-white">{T.label}</span>
        <h2 className="section-title">{T.title}</h2>
      </div>
      <p className="hint mt-1 mb-4">{T.hint}</p>
      <div className="grid gap-6 md:grid-cols-2">
        <div>
          <h3 className="mb-2 text-sm font-semibold">{T.accounts}</h3>
          <ul className="space-y-1.5 text-sm">
            {demo.map((u) => (
              <li key={u.email} className="flex flex-wrap items-baseline gap-x-2">
                <span dir="ltr" className="font-medium">
                  {u.email}
                </span>
                <span className="text-muted">· {lang === "ar" ? u.roleAr : u.roleEn}</span>
              </li>
            ))}
          </ul>
        </div>
        <details className="rounded-lg border border-line p-4">
          <summary className="btn-secondary cursor-pointer list-none [&::-webkit-details-marker]:hidden">{T.refresh}</summary>
          <ActionForm action={refreshTraining} hidden={{ lang }} resetOnSuccess={false} successMessage={T.refreshed} className="mt-3 space-y-3">
            <p className="text-sm text-muted">{T.refreshHint}</p>
            <label className="flex cursor-pointer items-start gap-2 text-sm">
              <input type="checkbox" name="anonymize" defaultChecked className="mt-0.5 size-4 shrink-0 accent-brand-600" />
              {T.anonymize}
            </label>
            <SubmitButton className="btn-primary" pendingLabel={T.refreshing}>
              {T.confirm}
            </SubmitButton>
          </ActionForm>
        </details>
      </div>
    </section>
  );
}
