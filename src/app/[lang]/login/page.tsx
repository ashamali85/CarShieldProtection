import type { Metadata } from "next";
import Link from "next/link";
import { getDictionary, isLocale } from "@/i18n";
import { notFound } from "next/navigation";
import { ActionForm, Field, SubmitButton } from "@/components/forms";
import { ShieldMark } from "@/components/logo";
import { login } from "@/lib/actions/auth";

export async function generateMetadata({ params }: PageProps<"/[lang]/login">): Promise<Metadata> {
  const { lang } = await params;
  return isLocale(lang) ? { title: getDictionary(lang).login.title } : {};
}

export default async function LoginPage({ params }: PageProps<"/[lang]/login">) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();
  const t = getDictionary(lang);
  const other = lang === "ar" ? "en" : "ar";

  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <ShieldMark className="size-12" />
          <h1 className="mt-3 text-lg font-semibold">{t.app.name}</h1>
          <p className="text-sm text-muted">{t.login.subtitle}</p>
        </div>
        <div className="card card-pad">
          <h2 className="section-title mb-4">{t.login.title}</h2>
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
    </main>
  );
}
