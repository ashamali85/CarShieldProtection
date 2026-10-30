import { Suspense } from "react";
import Link from "next/link";
import { lang as langParam } from "next/root-params";
import { notFound } from "next/navigation";
import { getDictionary, isLocale, type Locale } from "@/i18n";
import { BrandMark } from "@/components/logo";
import { ActiveNav, LanguageSwitch, NavLinks, type NavItem } from "@/components/nav";
import { getCurrentUser } from "@/lib/auth";
import { logout } from "@/lib/actions/auth";

function navItems(lang: Locale, isAdmin: boolean): NavItem[] {
  const t = getDictionary(lang).nav;
  const base = `/${lang}`;
  const items: NavItem[] = [
    { href: base, label: t.dashboard, icon: "dashboard" },
    { href: `${base}/jobs`, label: t.jobs, icon: "jobs" },
    { href: `${base}/customers`, label: t.customers, icon: "customers" },
    { href: `${base}/invoices`, label: t.invoices, icon: "invoices" },
    { href: `${base}/warranties`, label: t.warranties, icon: "warranties" },
    { href: `${base}/services`, label: t.services, icon: "services" },
    { href: `${base}/inventory`, label: t.inventory, icon: "inventory" },
  ];
  if (isAdmin) items.push({ href: `${base}/catalog`, label: t.catalog, icon: "catalog" });
  if (isAdmin) items.push({ href: `${base}/users`, label: t.users, icon: "users" });
  return items;
}

/** Reads the session, so it streams in behind a Suspense boundary. */
async function UserNav({ lang }: { lang: Locale }) {
  const user = await getCurrentUser();
  return <ActiveNav items={navItems(lang, user?.role === "admin")} home={`/${lang}`} />;
}

async function UserMenu({ lang }: { lang: Locale }) {
  const user = await getCurrentUser();
  const t = getDictionary(lang);
  if (!user) return null;
  return (
    <div className="flex items-center gap-3 border-t border-line pt-4">
      <span className="grid size-9 shrink-0 place-items-center rounded-full bg-brand-50 text-sm font-semibold text-brand-700">
        {user.name.slice(0, 1).toUpperCase()}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium" dir="auto">{user.name}</p>
        <p className="truncate text-xs text-muted">{t.users.roles[user.role]}</p>
      </div>
      <form action={logout}>
        <input type="hidden" name="lang" value={lang} />
        <button type="submit" className="btn-ghost px-2 text-xs">
          {t.nav.signOut}
        </button>
      </form>
    </div>
  );
}

export default async function AppLayout({ children }: LayoutProps<"/[lang]">) {
  const lang = await langParam();
  if (!isLocale(lang)) notFound();
  const t = getDictionary(lang);
  const fallbackNav = <NavLinks items={navItems(lang, false)} />;

  const sidebar = (
    <div className="flex h-full flex-col gap-6 p-4">
      <Link href={`/${lang}`} className="flex items-center gap-2.5 px-1">
        <BrandMark />
        <span className="leading-tight">
          <span className="block text-sm font-semibold">{t.app.short}</span>
          <span className="block text-xs text-muted">{t.app.tagline}</span>
        </span>
      </Link>
      <nav aria-label={t.app.name} className="flex-1">
        <Suspense fallback={fallbackNav}>
          <UserNav lang={lang} />
        </Suspense>
      </nav>
      <Suspense fallback={<div className="h-14" />}>
        <UserMenu lang={lang} />
      </Suspense>
    </div>
  );

  return (
    <div className="min-h-screen lg:flex">
      {/* Desktop sidebar */}
      <aside className="no-print sticky top-0 hidden h-screen w-64 shrink-0 border-e border-line bg-white lg:block">
        {sidebar}
      </aside>

      <div className="min-w-0 flex-1">
        {/* Mobile top bar with a disclosure menu */}
        <details className="no-print group border-b border-line bg-white lg:hidden">
          <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between px-4 [&::-webkit-details-marker]:hidden">
            <span className="flex items-center gap-2">
              <BrandMark className="size-7" />
              <span className="text-sm font-semibold">{t.app.short}</span>
            </span>
            <span className="grid size-10 place-items-center rounded-lg text-muted group-open:bg-canvas" aria-hidden="true">
              <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                <path d="M4 7h16M4 12h16M4 17h16" />
              </svg>
            </span>
          </summary>
          <div className="border-t border-line">{sidebar}</div>
        </details>

        <header className="no-print flex items-center justify-end px-4 pt-3 sm:px-8">
          <Suspense fallback={null}>
            <LanguageSwitch lang={lang} label={t.nav.language} />
          </Suspense>
        </header>
        <main className="mx-auto w-full max-w-6xl px-4 pb-16 sm:px-8">{children}</main>
      </div>
    </div>
  );
}
