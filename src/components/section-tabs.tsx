"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

export type SectionTab = { href: string; label: string; exact?: boolean };

/** Tab bar for a section; keeps the period in the query string when moving between report tabs. */
export function SectionTabs({ tabs, label, keepQuery }: { tabs: SectionTab[]; label: string; keepQuery?: string[] }) {
  const pathname = usePathname();
  const sp = useSearchParams();
  const q = new URLSearchParams();
  for (const k of keepQuery ?? []) {
    const v = sp.get(k);
    if (v) q.set(k, v);
  }
  const qs = q.toString() ? `?${q}` : "";
  return <TabsView tabs={tabs} label={label} pathname={pathname} query={qs} />;
}

export function TabsView({ tabs, label, pathname, query = "" }: { tabs: SectionTab[]; label: string; pathname: string; query?: string }) {
  return (
    <nav aria-label={label} className="no-print -mx-4 mb-2 overflow-x-auto px-4 pt-2 sm:mx-0 sm:px-0">
      <ul className="flex min-w-max gap-1 border-b border-line">
        {tabs.map((tab) => {
          const active = tab.exact ? pathname === tab.href : pathname.startsWith(tab.href);
          return (
            <li key={tab.href}>
              <Link
                href={tab.href + query}
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
