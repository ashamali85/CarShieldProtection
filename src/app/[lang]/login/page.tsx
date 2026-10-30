import type { Metadata } from "next";
import Link from "next/link";
import { getDictionary, isLocale } from "@/i18n";
import { notFound } from "next/navigation";
import { ActionForm, Field, SubmitButton } from "@/components/forms";
import { BrandLogo, BrandMark } from "@/components/logo";
import { IntroSplash } from "@/components/intro-splash";
import { login } from "@/lib/actions/auth";

export async function generateMetadata({ params }: PageProps<"/[lang]/login">): Promise<Metadata> {
  const { lang } = await params;
  return isLocale(lang) ? { title: getDictionary(lang).login.title } : {};
}

/** The landing page: brand panel with the 3D logo, and staff sign-in. */
export default async function LoginPage({ params }: PageProps<"/[lang]/login">) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();
  const t = getDictionary(lang);
  const other = lang === "ar" ? "en" : "ar";

  return (
    <>
      <IntroSplash skipLabel={t.login.skipIntro} />
      <main className="grid min-h-screen lg:grid-cols-2">
        {/* Brand panel */}
        <section className="flex flex-col items-center justify-center bg-white px-6 pt-10 pb-6 lg:border-e lg:border-line lg:py-12">
          <BrandLogo priority className="h-44 w-auto sm:h-56 lg:h-[min(62vh,560px)]" />
          <p className="mt-6 max-w-sm text-center text-sm text-muted lg:text-base">{t.login.welcome}</p>
        </section>

        {/* Sign-in */}
        <section className="flex flex-col items-center justify-center px-4 py-10">
          <div className="w-full max-w-sm">
            <div className="mb-6 flex items-center gap-3">
              <BrandMark className="size-10" />
              <div>
                <h1 className="text-lg font-semibold">{t.login.title}</h1>
                <p className="text-sm text-muted">{t.login.subtitle}</p>
              </div>
            </div>
            <div className="card card-pad">
              <ActionForm action={login} hidden={{ lang }} className="space-y-4">
                <Field label={t.login.email} name="email" type="email" autoComplete="username" required dir="ltr" />
                <Field label={t.login.password} name="password" type="password" autoComplete="current-password" required dir="ltr" />
                <SubmitButton className="btn-primary w-full" pendingLabel={t.common.loading}>
                  {t.login.submit}
                </SubmitButton>
              </ActionForm>
            </div>
            <p className="mt-6 text-center text-sm">
              <Link href={`/${other}/login`} className="link" hrefLang={other}>
                {t.nav.language}
              </Link>
            </p>
          </div>
        </section>
      </main>
    </>
  );
}
