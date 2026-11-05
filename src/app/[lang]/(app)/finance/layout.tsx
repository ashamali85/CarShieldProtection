import { Suspense } from "react";
import { lang as langParam } from "next/root-params";
import { notFound } from "next/navigation";
import { getDictionary, isLocale } from "@/i18n";
import { SectionTabs, TabsView } from "@/components/section-tabs";

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
    { href: `${base}/money`, label: T.tabs.money },
    { href: `${base}/settings`, label: T.tabs.settings },
  ];
  return (
    <>
      <Suspense fallback={<TabsView tabs={tabs} label={T.title} pathname="" />}>
        <SectionTabs tabs={tabs} label={T.title} keepQuery={["p", "y", "m", "q", "from", "to"]} />
      </Suspense>
      {children}
    </>
  );
}
