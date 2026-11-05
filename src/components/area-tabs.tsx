import type { Dictionary, Locale } from "@/i18n";
import { TabsView } from "@/components/section-tabs";

/** Customers · Warranties tabs (warranties live under Customers in the sidebar). */
export function CustomerTabs({ lang, t, current }: { lang: Locale; t: Dictionary; current: "customers" | "warranties" }) {
  const tabs = [
    { href: `/${lang}/customers`, label: t.nav.customers },
    { href: `/${lang}/warranties`, label: t.nav.warranties },
  ];
  return <TabsView tabs={tabs} label={t.nav.customers} pathname={`/${lang}/${current}`} />;
}

/** Services & prices · Car brands tabs (car brands are admin-only). */
export function CatalogTabs({ lang, t, current, isAdmin }: { lang: Locale; t: Dictionary; current: "services" | "catalog"; isAdmin: boolean }) {
  if (!isAdmin) return null;
  const tabs = [
    { href: `/${lang}/services`, label: t.nav.servicesTab },
    { href: `/${lang}/catalog`, label: t.nav.brandsTab },
  ];
  return <TabsView tabs={tabs} label={t.nav.catalog} pathname={`/${lang}/${current}`} />;
}
