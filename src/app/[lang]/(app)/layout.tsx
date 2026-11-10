import { Suspense } from "react";
import Link from "next/link";
import { lang as langParam } from "next/root-params";
import { notFound } from "next/navigation";
import { getDictionary, isLocale, type Locale } from "@/i18n";
import { BrandMark } from "@/components/logo";
import { ActiveNav, LanguageSwitch, NavLinks, type NavItem } from "@/components/nav";
import { can, getCurrentUser, type CurrentUser } from "@/lib/auth";
import type { Permission } from "@/lib/permissions";
import { logout } from "@/lib/actions/auth";

/**
 * The sidebar, grouped by how often each area is used, showing only what the user's role allows.
 * Warranties live under Customers, car brands under Catalog and roles under User accounts (as tabs),
 * so those URLs still highlight the parent link. A group's heading sits on its first visible link.
 */
function navItems(lang: Locale, user: CurrentUser | null): NavItem[] {
  const t = getDictionary(lang).nav;
  const base = `/${lang}`;
  const has = (p: Permission) => can(user, p);
  const pick = (...opts: [Permission, string][]) => opts.find(([p]) => has(p))?.[1];
  const groups: { label?: string; items: (NavItem | false | undefined)[] }[] = [
    { items: [{ href: base, label: t.dashboard, icon: "dashboard" }] },
    {
      label: t.groups.daily,
      items: [
        has("jobs.view") && { href: `${base}/jobs`, label: t.jobs, icon: "jobs" },
        (has("customers.view") || has("warranties.view")) && {
          href: pick(["customers.view", `${base}/customers`], ["warranties.view", `${base}/warranties`])!,
          match: [`${base}/customers`, `${base}/warranties`],
          label: t.customers,
          icon: "customers",
        },
        has("invoices.view") && { href: `${base}/invoices`, label: t.invoices, icon: "invoices" },
        has("inventory.view") && { href: `${base}/inventory`, label: t.inventory, icon: "inventory" },
      ],
    },
    {
      label: t.groups.management,
      items: [has("finance.view") && { href: `${base}/finance`, label: t.finance, icon: "finance" }, has("hr.view") && { href: `${base}/hr`, label: t.hr, icon: "hr" }],
    },
    {
      label: t.groups.setup,
      items: [
        (has("services.view") || has("catalog.manage")) && {
          href: pick(["services.view", `${base}/services`], ["catalog.manage", `${base}/catalog`])!,
          match: [`${base}/services`, `${base}/catalog`],
          label: t.catalog,
          icon: "services",
        },
        (has("users.manage") || has("roles.manage")) && {
          href: pick(["users.manage", `${base}/users`], ["roles.manage", `${base}/roles`])!,
          match: [`${base}/users`, `${base}/roles`],
          label: t.users,
          icon: "users",
        },
      ],
    },
  ];
  return groups.flatMap((g) => {
    const items = g.items.filter((i): i is NavItem => !!i);
    return items.map((item, n) => (n === 0 && g.label ? { ...item, group: g.label } : item));
  });
}

/** Reads the session, so it streams in behind a Suspense boundary. */
async function UserNav({ lang }: { lang: Locale }) {
  const user = await getCurrentUser();
  return <ActiveNav items={navItems(lang, user)} home={`/${lang}`} />;
}

async function UserMenu({ lang }: { lang: Locale }) {
  const user = await getCurrentUser();
  const t = getDictionary(lang);
  if (!user) return null;
  return (
    <div className="flex items-center gap-3 rounded-xl bg-white/[0.05] p-2.5 ring-1 ring-white/10">
      <span className="grid size-9 shrink-0 place-items-center rounded-full bg-linear-to-br from-silver-200 to-silver-400 text-sm font-semibold text-brand-900">
        {user.name.slice(0, 1).toUpperCase()}
      </span>
      <div className="min-w-0 flex-1">
        <Link href={`/${lang}/account`} className="block truncate text-sm font-medium text-white hover:underline" dir="auto" title={t.users.myAccount}>
          {user.name}
        </Link>
        <p className="truncate text-xs text-silver-400">{lang === "ar" ? user.roleNameAr : user.roleNameEn}</p>
      </div>
      <form action={logout}>
        <input type="hidden" name="lang" value={lang} />
        <button type="submit" className="btn min-h-9 px-2 text-xs text-silver-300 hover:bg-white/10 hover:text-white">
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
  const fallbackNav = <NavLinks items={navItems(lang, null)} />;

  const sidebar = (
    <div className="flex h-full flex-col gap-6 p-4">
      <Link href={`/${lang}`} className="sidebar-brand flex items-center gap-3 px-1">
        <BrandMark className="size-10" />
        <span className="leading-tight">
          <span className="block text-[15px] font-semibold tracking-tight text-white">{t.app.short}</span>
          <span className="block text-xs text-silver-400">{t.app.tagline}</span>
        </span>
      </Link>
      <div className="sidebar-brand h-px bg-linear-to-r from-transparent via-white/15 to-transparent" />
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
      <aside className="no-print sticky top-0 hidden h-screen w-64 shrink-0 bg-brand-950 bg-[radial-gradient(120%_60%_at_0%_0%,rgb(31_92_198/0.35),transparent_60%),linear-gradient(to_bottom,var(--color-brand-900),var(--color-brand-950))] lg:block">
        {sidebar}
      </aside>

      <div className="min-w-0 flex-1">
        {/* Mobile top bar with a disclosure menu */}
        <details className="no-print group bg-linear-to-b from-brand-900 to-brand-950 text-white lg:hidden">
          <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between px-4 [&::-webkit-details-marker]:hidden">
            <span className="flex items-center gap-2">
              <BrandMark className="size-7" />
              <span className="text-sm font-semibold">{t.app.short}</span>
            </span>
            <span className="grid size-10 place-items-center rounded-lg text-silver-300 group-open:bg-white/10" aria-hidden="true">
              <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                <path d="M4 7h16M4 12h16M4 17h16" />
              </svg>
            </span>
          </summary>
          <div className="border-t border-white/10 [&_.sidebar-brand]:hidden">{sidebar}</div>
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
