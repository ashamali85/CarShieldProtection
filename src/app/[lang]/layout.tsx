import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { lang as langParam } from "next/root-params";
import { dir, getDictionary, isLocale, locales } from "@/i18n";
import { BRAND } from "@/components/logo";
import "../globals.css";

export function generateStaticParams() {
  return locales.map((lang) => ({ lang }));
}

export async function generateMetadata(): Promise<Metadata> {
  const lang = await langParam();
  if (!isLocale(lang)) return {};
  const t = getDictionary(lang);
  return {
    title: { default: t.app.name, template: `%s · ${t.app.short}` },
    description: t.app.tagline,
    robots: { index: false, follow: false },
    icons: { icon: { url: BRAND.mark, type: "image/png" }, apple: BRAND.mark },
  };
}

export default async function RootLayout({ children }: LayoutProps<"/[lang]">) {
  const lang = await langParam();
  if (!isLocale(lang)) notFound();

  return (
    <html lang={lang} dir={dir(lang)} className="h-full antialiased">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@400;500;600&family=IBM+Plex+Sans:wght@400;500;600&display=swap"
        />
      </head>
      <body className="min-h-full">{children}</body>
    </html>
  );
}
