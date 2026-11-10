import { Suspense } from "react";
import { pageContext } from "@/lib/page";
import { changeOwnPassword } from "@/lib/actions/admin";
import { ActionForm, Field, SubmitButton } from "@/components/forms";
import { PageHeader, PageSkeleton } from "@/components/ui";

export default function AccountPage(props: PageProps<"/[lang]/account">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Account {...props} />
    </Suspense>
  );
}

/** Every signed-in person can see their details and change their own password. */
async function Account({ params }: PageProps<"/[lang]/account">) {
  const { lang, t, user } = await pageContext(params);
  const U = t.users;
  return (
    <>
      <PageHeader title={U.myAccount} />
      <div className="grid max-w-3xl gap-6 md:grid-cols-2">
        <section className="card card-pad content-start">
          <dl className="space-y-3 text-sm">
            <div>
              <dt className="text-muted">{U.name}</dt>
              <dd className="font-medium">{user.name}</dd>
            </div>
            <div>
              <dt className="text-muted">{U.email}</dt>
              <dd dir="ltr" className="text-start">
                {user.email}
              </dd>
            </div>
            <div>
              <dt className="text-muted">{U.role}</dt>
              <dd>{lang === "ar" ? user.roleNameAr : user.roleNameEn}</dd>
            </div>
          </dl>
        </section>
        <section className="card card-pad">
          <h2 className="section-title">{U.changePassword}</h2>
          <p className="hint mb-4">{U.yourPasswordHint}</p>
          <ActionForm action={changeOwnPassword} hidden={{ lang }} successMessage={U.passwordChanged} className="space-y-4">
            <Field label={U.currentPassword} name="current" type="password" required autoComplete="current-password" dir="ltr" />
            <Field label={U.newPassword} name="password" type="password" required minLength={8} autoComplete="new-password" dir="ltr" />
            <Field label={U.confirmPassword} name="confirm" type="password" required minLength={8} autoComplete="new-password" dir="ltr" />
            <SubmitButton className="btn-primary w-full" pendingLabel={t.common.saving}>
              {U.changePassword}
            </SubmitButton>
          </ActionForm>
        </section>
      </div>
    </>
  );
}
