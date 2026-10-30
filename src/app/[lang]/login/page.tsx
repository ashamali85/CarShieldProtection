import type { Metadata } from "next";
import Link from "next/link";
import { getDictionary, isLocale } from "@/i18n";
import { notFound } from "next/navigation";
import { ActionForm, Field, SubmitButton } from "@/components/forms";
import { BRAND, BrandLogo } from "@/components/logo";
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
      <main className="grid min-h-dvh lg:grid-cols-[1.1fr_1fr]">
        {/* Brand panel: Higgsfield studio photo with the headline in its open upper area */}
        <section className="relative isolate flex min-h-56 flex-col overflow-hidden bg-[#e9ebef] sm:min-h-72 lg:min-h-dvh">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={BRAND.hero}
            alt=""
            aria-hidden="true"
            width={880}
            height={1168}
            fetchPriority="high"
            className="absolute inset-0 -z-10 h-full w-full object-cover object-[50%_72%] lg:object-bottom"
          />
          <div className="absolute inset-0 -z-10 bg-linear-to-b from-white/85 via-white/30 via-40% to-transparent" />
          <div className="hidden p-10 lg:block xl:p-14">
            <p className="eyebrow">{BRAND.name}</p>
            <h2 className="mt-3 max-w-md text-4xl leading-tight font-semibold tracking-tight text-brand-950 xl:text-5xl">
              {t.login.heroTitle}
            </h2>
            <p className="mt-4 max-w-sm text-base text-muted">{t.login.welcome}</p>
          </div>
        </section>

        {/* Sign-in */}
        <section className="relative flex flex-col items-center justify-center px-4 pt-0 pb-10 lg:py-10">
          <div className="-mt-16 w-full max-w-sm lg:mt-0">
            <div className="mb-6 flex flex-col items-center text-center">
              <span className="rounded-3xl bg-white p-3 shadow-(--shadow-lift) ring-1 ring-line lg:bg-transparent lg:p-0 lg:shadow-none lg:ring-0">
                <BrandLogo priority className="h-28 w-auto sm:h-32 lg:h-44" />
              </span>
              <h1 className="mt-6 text-xl font-semibold tracking-tight">{t.login.title}</h1>
              <p className="mt-1 text-sm text-muted">{t.login.subtitle}</p>
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
            <p className="mt-4 text-center text-sm text-muted lg:hidden">{t.login.welcome}</p>
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
