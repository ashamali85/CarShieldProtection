import { Suspense } from "react";
import { notFound } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { pageContext } from "@/lib/page";
import { canGrant } from "@/lib/roles";
import { ALL_PERMISSIONS, normalizePermissions } from "@/lib/permissions";
import { deleteRole, saveRole } from "@/lib/actions/roles";
import { UUID_RE } from "@/lib/actions/helpers";
import { ActionForm, Field, SubmitButton } from "@/components/forms";
import { PageHeader, PageSkeleton } from "@/components/ui";
import { RowDelete } from "@/components/finance/row-delete";
import { PermissionMatrix } from "@/components/roles/permission-matrix";

export default function RolePage(props: PageProps<"/[lang]/roles/[id]">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <RoleView {...props} />
    </Suspense>
  );
}

async function RoleView({ params }: PageProps<"/[lang]/roles/[id]">) {
  const { lang, t, user: me } = await pageContext(params, { perm: "roles.manage" });
  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();
  const R = t.roles;
  const db = await getDb();
  const [role] = await db.select().from(schema.roles).where(eq(schema.roles.id, id)).limit(1);
  if (!role) notFound();
  const members = await db
    .select({ id: schema.users.id, name: schema.users.name, email: schema.users.email, active: schema.users.active })
    .from(schema.users)
    .where(eq(schema.users.roleId, id))
    .orderBy(asc(schema.users.name));
  // The Admin role, and roles with access the editor lacks, are shown read-only.
  const editable = !role.system && role.id !== me.roleId && canGrant(me, role);
  const perms = role.system ? ALL_PERMISSIONS : normalizePermissions(role.permissions);
  const name = lang === "ar" ? role.nameAr : role.nameEn;

  return (
    <>
      <PageHeader title={<span dir="auto">{name}</span>} subtitle={role.system ? R.adminLocked : undefined} back={{ href: `/${lang}/roles`, label: R.viewAll }} />
      <div className="grid gap-6 lg:grid-cols-3">
        <section className="card card-pad min-w-0 content-start lg:col-span-2">
          <ActionForm action={saveRole} hidden={{ lang, id }} resetOnSuccess={false} successMessage={R.saved} className="space-y-5">
            {editable && (
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label={R.nameEn} name="nameEn" required defaultValue={role.nameEn} />
                <Field label={R.nameAr} name="nameAr" required dir="rtl" defaultValue={role.nameAr} />
              </div>
            )}
            <div>
              <h2 className="section-title">{R.permissions}</h2>
              {editable ? <p className="hint mb-3">{R.permissionsHint}</p> : !role.system && <p className="hint mb-3">{t.users.notAllowed}</p>}
              <PermissionMatrix initial={perms} grantable={[...me.permissions]} readOnly={!editable} labels={{ areas: R.areas, perms: R.perms }} />
            </div>
            {editable && (
              <SubmitButton className="btn-primary" pendingLabel={t.common.saving}>
                {t.common.save}
              </SubmitButton>
            )}
          </ActionForm>
        </section>
        <aside className="grid min-w-0 content-start gap-6 [&>*]:min-w-0">
          <section className="card">
            <h2 className="section-title border-b border-line px-4 py-3.5 sm:px-6">
              {R.users} <span className="num font-normal text-muted">({members.length})</span>
            </h2>
            {members.length === 0 ? (
              <p className="px-4 py-4 text-sm text-muted sm:px-6">—</p>
            ) : (
              <ul>
                {members.map((u) => (
                  <li key={u.id} className={`border-b border-line px-4 py-2.5 text-sm last:border-b-0 sm:px-6 ${u.active ? "" : "text-muted"}`}>
                    <span className="block font-medium" dir="auto">
                      {u.name}
                    </span>
                    <span className="block text-xs text-muted" dir="ltr">
                      <span className="block text-start">{u.email}</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
          {editable && (
            <section className="card card-pad">
              {members.length > 0 ? (
                <p className="text-sm text-muted">{R.inUse}</p>
              ) : (
                <div className="flex justify-end">
                  <RowDelete action={deleteRole} hidden={{ lang, id }} labels={{ delete: R.delete, confirm: R.deleteConfirm, cancel: t.common.cancel, saving: t.common.saving }} />
                </div>
              )}
            </section>
          )}
        </aside>
      </div>
    </>
  );
}
