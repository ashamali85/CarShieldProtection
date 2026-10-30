import { Suspense } from "react";
import { getDb, schema } from "@/db";
import { pageContext } from "@/lib/page";
import { createUser, toggleUserActive } from "@/lib/actions/admin";
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
  const { lang, t, user: me } = await pageContext(params, { admin: true });
  const db = await getDb();
  const rows = await db
    .select({ id: schema.users.id, name: schema.users.name, email: schema.users.email, role: schema.users.role, active: schema.users.active })
    .from(schema.users)
    .orderBy(schema.users.name);

  return (
    <>
      <PageHeader title={t.users.title} />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="card lg:col-span-2">
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
                    <td>{t.users.roles[u.role]}</td>
                    <td>
                      <span className={`badge ${u.active ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-600"}`}>
                        {u.active ? t.common.active : t.common.inactive}
                      </span>
                    </td>
                    <td className="text-end">
                      {u.id !== me.id && (
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
              <select id="f-role" name="role" className="input" defaultValue="staff">
                {(["staff", "technician", "admin"] as const).map((r) => (
                  <option key={r} value={r}>
                    {t.users.roles[r]}
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
