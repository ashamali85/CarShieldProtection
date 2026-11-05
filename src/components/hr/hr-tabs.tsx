"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type Labels = { overview: string; employees: string; leave: string; payroll: string; settings: string };

/** Sub-navigation for the HR section, highlighting the current page. */
export function HrTabs({ lang, labels, settings = true }: { lang: string; labels: Labels; settings?: boolean }) {
  return <TabsView lang={lang} labels={labels} pathname={usePathname()} settings={settings} />;
}

/** The tab bar itself; also used (with no active tab) while the address is still loading. */
export function TabsView({ lang, labels, pathname, settings = true }: { lang: string; labels: Labels; pathname: string; settings?: boolean }) {
  const base = `/${lang}/hr`;
  const tabs = [
    { href: base, label: labels.overview, exact: true },
    { href: `${base}/employees`, label: labels.employees },
    { href: `${base}/leave`, label: labels.leave },
    { href: `${base}/payroll`, label: labels.payroll },
    ...(settings ? [{ href: `${base}/settings`, label: labels.settings }] : []),
  ];
  return (
    <nav aria-label="HR" className="no-print -mx-4 mb-2 overflow-x-auto px-4 pt-2 sm:mx-0 sm:px-0">
      <ul className="flex min-w-max gap-1 border-b border-line">
        {tabs.map((tab) => {
          const active = tab.exact ? pathname === tab.href : pathname.startsWith(tab.href);
          return (
            <li key={tab.href}>
              <Link
                href={tab.href}
                aria-current={active ? "page" : undefined}
                className={`-mb-px inline-flex min-h-10 items-center border-b-2 px-3 text-sm font-medium transition-colors ${
                  active ? "border-brand-600 text-brand-700" : "border-transparent text-muted hover:border-silver-300 hover:text-ink"
                }`}
              >
                {tab.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
