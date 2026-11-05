import type { Dictionary, Locale } from "@/i18n";
import { TabsView } from "@/components/section-tabs";

/** Customers · Warranties tabs (warranties live under Customers in the sidebar), each shown if the role can see it. */
export function CustomerTabs({ lang, t, current, customers, warranties }: { lang: Locale; t: Dictionary; current: "customers" | "warranties"; customers: boolean; warranties: boolean }) {
  if (!customers || !warranties) return null;
  const tabs = [
    { href: `/${lang}/customers`, label: t.nav.customers },
    { href: `/${lang}/warranties`, label: t.nav.warranties },
  ];
  return <TabsView tabs={tabs} label={t.nav.customers} pathname={`/${lang}/${current}`} />;
}

/** Services & prices · Car brands tabs, shown when the user may edit car brands. */
export function CatalogTabs({ lang, t, current, showBrands }: { lang: Locale; t: Dictionary; current: "services" | "catalog"; showBrands: boolean }) {
  if (!showBrands) return null;
  const tabs = [
    { href: `/${lang}/services`, label: t.nav.servicesTab },
    { href: `/${lang}/catalog`, label: t.nav.brandsTab },
  ];
  return <TabsView tabs={tabs} label={t.nav.catalog} pathname={`/${lang}/${current}`} />;
}

/** User accounts · Roles tabs, each shown when the user may manage it. */
export function UserTabs({ lang, t, current, users, roles }: { lang: Locale; t: Dictionary; current: "users" | "roles"; users: boolean; roles: boolean }) {
  const tabs = [users && { href: `/${lang}/users`, label: t.users.tabs.users }, roles && { href: `/${lang}/roles`, label: t.users.tabs.roles }].filter(
    (x): x is { href: string; label: string } => !!x,
  );
  if (tabs.length < 2) return null;
  return <TabsView tabs={tabs} label={t.nav.users} pathname={`/${lang}/${current}`} />;
}
