import "server-only";
import { notFound } from "next/navigation";
import { getDictionary, isLocale, type Dictionary, type Locale } from "@/i18n";
import { requireAdmin, requireUser, type CurrentUser } from "./auth";

/** Validates the locale and the session for a page body. */
export async function pageContext(
  params: Promise<{ lang: string }>,
  opts: { admin?: boolean } = {},
): Promise<{ lang: Locale; t: Dictionary; user: CurrentUser }> {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();
  const user = opts.admin ? await requireAdmin(lang) : await requireUser(lang);
  return { lang, t: getDictionary(lang), user };
}

export function first(v: string | string[] | undefined): string {
  return (Array.isArray(v) ? v[0] : v)?.trim() ?? "";
}
