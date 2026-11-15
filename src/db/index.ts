import "server-only";
import { neon } from "@neondatabase/serverless";
import { drizzle as drizzleNeon, type NeonHttpDatabase } from "drizzle-orm/neon-http";
import { currentMode, type DbMode } from "@/lib/session-token";
import * as schema from "./schema";

export type Db = NeonHttpDatabase<typeof schema>;

/**
 * Two databases with the same structure:
 *  - DATABASE_URL           the real shop
 *  - TRAINING_DATABASE_URL  a practice copy; only demo accounts (stored there) ever use it
 * Each URL is postgres://… (Neon, HTTP driver) or pglite://./dir for local development.
 */
const URLS: Record<DbMode, string | undefined> = {
  live: process.env.DATABASE_URL,
  training: process.env.TRAINING_DATABASE_URL,
};

declare global {
  var __cspDbs: Partial<Record<DbMode, Promise<Db>>> | undefined;
}

async function createDb(mode: DbMode): Promise<Db> {
  const url = URLS[mode];
  if (!url) {
    throw new Error(mode === "live" ? "DATABASE_URL is not set. See README.md for setup." : "TRAINING_DATABASE_URL is not set.");
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

/** A specific database, regardless of who is signed in (used by sign-in). */
export function dbFor(mode: DbMode): Promise<Db> {
  globalThis.__cspDbs ??= {};
  return (globalThis.__cspDbs[mode] ??= createDb(mode));
}

/** Whether the training copy is set up. */
export const trainingEnabled = () => !!URLS.training;

/** The database for the current request: the training copy for demo accounts, otherwise the real shop. */
export async function getDb(): Promise<Db> {
  return dbFor(await currentMode());
}

export { schema };
