import { Suspense } from "react";
import { lang as langParam } from "next/root-params";
import { notFound } from "next/navigation";
import { getDictionary, isLocale } from "@/i18n";
import { SectionTabs, TabsView, type SectionTab } from "@/components/section-tabs";
import { can, getCurrentUser } from "@/lib/auth";

/** Reads the session, so it renders inside the Suspense boundary. Settings is only for people who can change it. */
async function Tabs({ tabs, label, settingsHref }: { tabs: SectionTab[]; label: string; settingsHref: string }) {
  const user = await getCurrentUser();
  const shown = can(user, "finance.manage") ? tabs : tabs.filter((x) => x.href !== settingsHref);
  return <SectionTabs tabs={shown} label={label} keepQuery={["p", "y", "m", "q", "from", "to"]} />;
}

export default async function FinanceLayout({ children }: LayoutProps<"/[lang]/finance">) {
  const lang = await langParam();
  if (!isLocale(lang)) notFound();
  const T = getDictionary(lang).finance;
  const base = `/${lang}/finance`;
  const tabs = [
    { href: base, label: T.tabs.dashboard, exact: true },
    { href: `${base}/pnl`, label: T.tabs.pnl },
    { href: `${base}/cashflow`, label: T.tabs.cashflow },
    { href: `${base}/expenses`, label: T.tabs.expenses },
    { href: `${base}/contracts`, label: T.tabs.contracts },
    { href: `${base}/money`, label: T.tabs.money },
    { href: `${base}/settings`, label: T.tabs.settings },
  ];
  return (
    <>
      <Suspense fallback={<TabsView tabs={tabs} label={T.title} pathname="" />}>
        <Tabs tabs={tabs} label={T.title} settingsHref={`${base}/settings`} />
      </Suspense>
      {children}
    </>
  );
}
