import "server-only";
import { defaultLocale, getDictionary, isLocale, type Locale } from "@/i18n";

export function langFrom(formData: FormData): Locale {
  const v = formData.get("lang");
  return typeof v === "string" && isLocale(v) ? v : defaultLocale;
}

/** Longest text accepted in any single form field (longer input is cut). */
const MAX_TEXT = 4000;

export function str(formData: FormData, name: string): string {
  const v = formData.get(name);
  return typeof v === "string" ? v.trim().slice(0, MAX_TEXT) : "";
}

/** A password exactly as typed (no trimming). Empty when missing. */
export function password(formData: FormData, name: string): string {
  const v = formData.get(name);
  return typeof v === "string" ? v : "";
}

/** bcrypt only uses the first 72 bytes, so longer passwords are refused rather than silently cut. */
export function passwordProblem(pw: string): "short" | "long" | null {
  if (pw.length < 8) return "short";
  if (new TextEncoder().encode(pw).length > 72) return "long";
  return null;
}

/** "%text%" for ILIKE, with %, _ and \ in the text matched literally. */
export function likeAny(q: string): string {
  return `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

export function optStr(formData: FormData, name: string): string | null {
  const v = str(formData, name);
  return v === "" ? null : v;
}

/** Parses an inventory quantity like "1.5" into thousandths. Returns null when invalid. */
export function qtyToMilli(input: string): number | null {
  return input === "" ? null : kwdToFils(input);
}

/** Largest amount accepted anywhere: 1,000,000 KWD (keeps sums inside the database's integer range). */
const MAX_FILS = 1_000_000_000;

/** Parses a KWD amount like "12.5" into integer fils. Returns null when invalid or too large. */
export function kwdToFils(input: string): number | null {
  if (input === "") return 0;
  const normalized = input.replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d))).replace(",", ".");
  if (!/^\d{1,10}(\.\d{0,3})?$/.test(normalized)) return null;
  const fils = Math.round(Number(normalized) * 1000);
  return fils <= MAX_FILS ? fils : null;
}

/** Whole numbers up to ±1,000,000; null when invalid. */
export function intOrNull(input: string): number | null {
  if (input === "") return null;
  const n = Number(input);
  return Number.isInteger(n) && Math.abs(n) <= 1_000_000 ? n : null;
}

export function t(lang: Locale) {
  return getDictionary(lang);
}

/** A structurally valid IBAN (country, check digits, account) whose mod-97 check passes. */
export function validIban(iban: string): boolean {
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(iban)) return false;
  if (iban.startsWith("KW") && iban.length !== 30) return false;
  const digits = (iban.slice(4) + iban.slice(0, 4)).replace(/[A-Z]/g, (c) => String(c.charCodeAt(0) - 55));
  let rem = 0;
  for (const d of digits) rem = (rem * 10 + Number(d)) % 97;
  return rem === 1;
}

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
