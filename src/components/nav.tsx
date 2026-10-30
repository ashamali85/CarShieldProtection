"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export type NavItem = { href: string; label: string; icon: keyof typeof ICONS };

const ICONS = {
  dashboard: "M3 12.5 12 4l9 8.5M5.5 10.5V20h13v-9.5",
  jobs: "M9 5h6M9 3.5h6v3H9zM6 5H5v16h14V5h-1M8.5 11h7M8.5 15h5",
  customers: "M16 19v-1.5a3.5 3.5 0 0 0-3.5-3.5h-5A3.5 3.5 0 0 0 4 17.5V19M10 10.5a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM20 19v-1.5a3.5 3.5 0 0 0-2.5-3.3M15 4.6a3 3 0 0 1 0 5.8",
  invoices: "M6 3h12v18l-3-2-3 2-3-2-3 2V3ZM9 8h6M9 12h6M9 16h3",
  warranties: "M12 3 5 6v5.5c0 4.5 3 8 7 9.5 4-1.5 7-5 7-9.5V6l-7-3ZM9 12l2 2 4-4",
  services: "M4 7h16M4 12h16M4 17h10",
  inventory: "M3.5 7.5 12 3l8.5 4.5v9L12 21l-8.5-4.5v-9ZM3.5 7.5 12 12l8.5-4.5M12 12v9",
  users: "M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1",
} as const;

export function Icon({ name, className = "size-5" }: { name: keyof typeof ICONS; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={ICONS[name]} />
    </svg>
  );
}

export function NavLinks({ items, activeHref }: { items: NavItem[]; activeHref?: string }) {
  return (
    <ul className="flex flex-col gap-0.5">
      {items.map((item) => {
        const active = item.href === activeHref;
        return (
          <li key={item.href}>
            <Link
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={`flex min-h-10 items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors ${
                active ? "bg-brand-50 text-brand-700" : "text-muted hover:bg-canvas hover:text-ink"
              }`}
            >
              <Icon name={item.icon} />
              {item.label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

/** Highlights the section the current URL belongs to. */
export function ActiveNav({ items, home }: { items: NavItem[]; home: string }) {
  const pathname = usePathname();
  const active =
    items
      .filter((i) => (i.href === home ? pathname === home : pathname.startsWith(i.href)))
      .sort((a, b) => b.href.length - a.href.length)[0]?.href ?? undefined;
  return <NavLinks items={items} activeHref={active} />;
}

export function LanguageSwitch({ lang, label }: { lang: string; label: string }) {
  const pathname = usePathname();
  const other = lang === "ar" ? "en" : "ar";
  const href = pathname.replace(/^\/(en|ar)(?=\/|$)/, `/${other}`);
  return (
    <Link href={href} hrefLang={other} className="btn-ghost">
      {label}
    </Link>
  );
}
