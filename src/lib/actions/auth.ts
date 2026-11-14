"use server";

import bcrypt from "bcryptjs";
import { and, eq, gt, inArray, sql } from "drizzle-orm";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getDb, schema } from "@/db";
import type { Db } from "@/db";
import { createSession, destroySession } from "@/lib/session";
import type { ActionState } from "@/components/forms";
import { langFrom, password, str, t } from "./helpers";

/** Failures allowed per email and per IP address within the window, before a lock of the same length. */
const LIMITS = { email: 5, ip: 20 } as const;
const WINDOW = "15 minutes";

/** A real bcrypt hash of a random string, compared against when the email is unknown so timing gives nothing away. */
const DUMMY_HASH = "$2b$10$uUQsGj8PSFFmsXxrHSrXO.gob2KFq/vJn67agm5pq/xup7ccHWOXa";

async function clientIp(): Promise<string> {
  const h = await headers();
  // On Vercel these are set by the platform, not taken from the visitor.
  return h.get("x-real-ip") ?? h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
}

/** Minutes left on the longest active lock for these keys, or 0. */
async function lockedFor(db: Db, keys: string[]): Promise<number> {
  const rows = await db
    .select({ until: schema.loginAttempts.lockedUntil })
    .from(schema.loginAttempts)
    .where(and(inArray(schema.loginAttempts.key, keys), gt(schema.loginAttempts.lockedUntil, new Date())));
  const until = Math.max(0, ...rows.map((r) => r.until!.getTime()));
  return until ? Math.ceil((until - Date.now()) / 60000) : 0;
}

/** Counts a failure in one atomic statement; reaching the limit locks the key for the window. */
async function recordFailure(db: Db, key: string, limit: number) {
  const stale = sql`${schema.loginAttempts.windowStart} < now() - ${WINDOW}::interval`;
  const next = sql`case when ${stale} then 1 else ${schema.loginAttempts.failures} + 1 end`;
  await db
    .insert(schema.loginAttempts)
    .values({ key, failures: 1, lockedUntil: limit <= 1 ? sql`now() + ${WINDOW}::interval` : null })
    .onConflictDoUpdate({
      target: schema.loginAttempts.key,
      set: {
        failures: next,
        windowStart: sql`case when ${stale} then now() else ${schema.loginAttempts.windowStart} end`,
        lockedUntil: sql`case when ${next} >= ${limit} then now() + ${WINDOW}::interval else ${schema.loginAttempts.lockedUntil} end`,
      },
    });
}

export async function login(_: ActionState, formData: FormData): Promise<ActionState> {
  const lang = langFrom(formData);
  const dict = t(lang);
  const email = str(formData, "email").toLowerCase().slice(0, 254);
  const pw = password(formData, "password");
  if (!email || !pw) return { error: dict.common.required };

  const db = await getDb();
  const ip = await clientIp();
  const keys = [`email:${email}`, `ip:${ip}`];
  const wait = await lockedFor(db, keys);
  if (wait > 0) return { error: dict.login.tooMany.replace("{n}", String(wait)) };

  const [user] = await db.select().from(schema.users).where(eq(schema.users.email, email)).limit(1);
  // Always run bcrypt, even for unknown or inactive accounts, so response time doesn't reveal which emails exist.
  const match = await bcrypt.compare(pw, user?.passwordHash ?? DUMMY_HASH);
  if (!user || !user.active || !match) {
    await recordFailure(db, keys[0], LIMITS.email);
    await recordFailure(db, keys[1], LIMITS.ip);
    // If that was the attempt that triggered the lock, say so straight away.
    const nowLocked = await lockedFor(db, keys);
    return { error: nowLocked > 0 ? dict.login.tooMany.replace("{n}", String(nowLocked)) : dict.login.invalid };
  }

  // A successful sign-in clears that email's counter.
  await db.delete(schema.loginAttempts).where(eq(schema.loginAttempts.key, keys[0]));
  await createSession(user.id, user.sessionVersion);
  redirect(`/${lang}`);
}

export async function logout(formData: FormData) {
  const lang = langFrom(formData);
  await destroySession();
  redirect(`/${lang}/login`);
}
