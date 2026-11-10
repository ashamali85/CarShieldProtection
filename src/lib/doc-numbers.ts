import "server-only";
import { sql } from "drizzle-orm";
import { schema } from "@/db";
import type { Db } from "@/db";
import { todayKuwait } from "@/lib/dates";

/**
 * Document numbers: a prefix, the year (Kuwait time) and a running number that restarts every
 * January, e.g. JB-2026-0068. The counter is bumped atomically, so two people can't get the same one.
 */
const PREFIX = { job: "JB", invoice: "INV", warranty: "WR" } as const;
export type DocKind = keyof typeof PREFIX;

export function docCode(kind: DocKind, year: number, n: number): string {
  return `${PREFIX[kind]}-${year}-${String(n).padStart(4, "0")}`;
}

/** Reserves the next number(s) of a kind for this year and returns their codes. */
export async function nextDocCodes(db: Db, kind: DocKind, count = 1): Promise<string[]> {
  if (count < 1) return [];
  const year = +todayKuwait().slice(0, 4);
  const [row] = await db
    .insert(schema.docCounters)
    .values({ kind, year, last: count })
    .onConflictDoUpdate({ target: [schema.docCounters.kind, schema.docCounters.year], set: { last: sql`${schema.docCounters.last} + ${count}` } })
    .returning({ last: schema.docCounters.last });
  return Array.from({ length: count }, (_, i) => docCode(kind, year, row.last - count + 1 + i));
}

export async function nextDocCode(db: Db, kind: DocKind): Promise<string> {
  return (await nextDocCodes(db, kind, 1))[0];
}

/**
 * A LIKE pattern for finding a document by what someone typed: "68" or "0068" match any year's
 * …-0068, "2026-68" matches …-2026-0068, and anything else (e.g. "JB-2026-0068") matches as typed.
 */
export function codePattern(input: string): string {
  const q = input.trim().toUpperCase().replace(/^#/, "").replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)));
  if (/^\d{1,6}$/.test(q)) return `%-${q.padStart(4, "0")}`;
  const m = q.match(/^(\d{4})[-\s/](\d{1,6})$/);
  if (m) return `%-${m[1]}-${m[2].padStart(4, "0")}`;
  return `%${q.replace(/[%_\\]/g, "")}%`;
}
