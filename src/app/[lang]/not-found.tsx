import Link from "next/link";
import { lang as langParam } from "next/root-params";
import { defaultLocale, getDictionary, isLocale } from "@/i18n";
import { ShieldMark } from "@/components/logo";

export default async function NotFound() {
  const raw = await langParam();
  const lang = isLocale(raw) ? raw : defaultLocale;
  const t = getDictionary(lang);
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 px-4 text-center">
      <ShieldMark className="size-12" />
      <p className="text-muted">{t.errors.notFound}</p>
      <Link href={`/${lang}`} className="btn-primary">
        {t.errors.goHome}
      </Link>
    </main>
  );
}
