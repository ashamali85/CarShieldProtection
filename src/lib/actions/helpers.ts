import "server-only";
import { defaultLocale, getDictionary, isLocale, type Locale } from "@/i18n";

export function langFrom(formData: FormData): Locale {
  const v = formData.get("lang");
  return typeof v === "string" && isLocale(v) ? v : defaultLocale;
}

export function str(formData: FormData, name: string): string {
  const v = formData.get(name);
  return typeof v === "string" ? v.trim() : "";
}

export function optStr(formData: FormData, name: string): string | null {
  const v = str(formData, name);
  return v === "" ? null : v;
}

/** Parses an inventory quantity like "1.5" into thousandths. Returns null when invalid. */
export function qtyToMilli(input: string): number | null {
  return input === "" ? null : kwdToFils(input);
}

/** Parses a KWD amount like "12.5" into integer fils. Returns null when invalid. */
export function kwdToFils(input: string): number | null {
  if (input === "") return 0;
  const normalized = input.replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d))).replace(",", ".");
  if (!/^\d+(\.\d{0,3})?$/.test(normalized)) return null;
  return Math.round(Number(normalized) * 1000);
}

export function intOrNull(input: string): number | null {
  if (input === "") return null;
  const n = Number(input);
  return Number.isInteger(n) ? n : null;
}

export function t(lang: Locale) {
  return getDictionary(lang);
}

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
