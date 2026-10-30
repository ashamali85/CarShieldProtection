import "server-only";
import { neon } from "@neondatabase/serverless";
import { drizzle as drizzleNeon, type NeonHttpDatabase } from "drizzle-orm/neon-http";
import * as schema from "./schema";

export type Db = NeonHttpDatabase<typeof schema>;

/**
 * DATABASE_URL
 *  - postgres://… (Neon)       → production / preview, via Neon's HTTP driver
 *  - pglite://./.pglite         → local development with an in-process Postgres
 */
const url = process.env.DATABASE_URL;

declare global {
  var __cspDb: Promise<Db> | undefined;
}

async function createDb(): Promise<Db> {
  if (!url) {
    throw new Error("DATABASE_URL is not set. See README.md for setup.");
  }
  if (url.startsWith("pglite://")) {
    const { PGlite } = await import("@electric-sql/pglite");
    const { drizzle } = await import("drizzle-orm/pglite");
    const dir = url.slice("pglite://".length) || "./.pglite";
    const client = new PGlite(dir);
    // The query API is identical; the cast keeps one type across drivers.
    return drizzle(client, { schema }) as unknown as Db;
  }
  return drizzleNeon(neon(url), { schema });
}

export function getDb(): Promise<Db> {
  globalThis.__cspDb ??= createDb();
  return globalThis.__cspDb;
}

export { schema };
