import en, { type Dictionary } from "./en";
import ar from "./ar";

export const locales = ["en", "ar"] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = "en";

const dictionaries: Record<Locale, Dictionary> = { en, ar };

export function isLocale(value: string | undefined | null): value is Locale {
  return !!value && (locales as readonly string[]).includes(value);
}

export function getDictionary(locale: Locale): Dictionary {
  return dictionaries[locale];
}

export function dir(locale: Locale): "rtl" | "ltr" {
  return locale === "ar" ? "rtl" : "ltr";
}

/** Intl locale tag. Latin digits in both languages keep numbers, plates and codes consistent. */
function intlTag(locale: Locale) {
  return locale === "ar" ? "ar-KW-u-nu-latn" : "en-KW";
}

const TZ = "Asia/Kuwait";

export function formatMoney(fils: number, locale: Locale): string {
  const value = new Intl.NumberFormat(intlTag(locale), {
    minimumFractionDigits: 3,
    maximumFractionDigits: 3,
  }).format(fils / 1000);
  return locale === "ar" ? `${value} د.ك` : `KWD ${value}`;
}

export function formatDate(value: Date | string | null | undefined, locale: Locale): string {
  if (!value) return "—";
  const d = typeof value === "string" ? new Date(value.length === 10 ? `${value}T00:00:00` : value) : value;
  return new Intl.DateTimeFormat(intlTag(locale), {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: typeof value === "string" && value.length === 10 ? undefined : TZ,
  }).format(d);
}

export function formatDateTime(value: Date | null | undefined, locale: Locale): string {
  if (!value) return "—";
  return new Intl.DateTimeFormat(intlTag(locale), {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: TZ,
  }).format(value);
}

export function formatNumber(n: number, locale: Locale): string {
  return new Intl.NumberFormat(intlTag(locale)).format(n);
}

export type { Dictionary };
