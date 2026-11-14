import "server-only";
import { notFound } from "next/navigation";
import { getDictionary, isLocale, type Dictionary, type Locale } from "@/i18n";
import { requirePermission, requireUser, type CurrentUser } from "./auth";
import type { Permission } from "./permissions";

/** Validates the locale and the session for a page body. */
export async function pageContext(
  params: Promise<{ lang: string }>,
  opts: { perm?: Permission } = {},
): Promise<{ lang: Locale; t: Dictionary; user: CurrentUser }> {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();
  const user = opts.perm ? await requirePermission(lang, opts.perm) : await requireUser(lang);
  return { lang, t: getDictionary(lang), user };
}

/** The first value of a query parameter, trimmed and capped at 200 characters. */
export function first(v: string | string[] | undefined): string {
  return ((Array.isArray(v) ? v[0] : v)?.trim() ?? "").slice(0, 200);
}
