import "server-only";
import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { and, eq, lt, ne } from "drizzle-orm";
import { SignJWT } from "jose";
import { dbFor, getDb, schema } from "@/db";
import { readSession, SESSION_COOKIE, sessionKey, type DbMode } from "./session-token";

export { readSession, SESSION_COOKIE, type SessionPayload } from "./session-token";

const MAX_AGE_SECONDS = 60 * 60 * 12; // one working day

/**
 * The cookie is a signed token naming the user, a server-side session row (sid), the user's
 * session version and which database they belong to (mode). A page or action only accepts it while
 * that row still exists (see auth.ts), so signing out, a password change or deleting the user ends
 * it immediately.
 */
export async function createSession(userId: string, version: number, mode: DbMode) {
  const db = await dbFor(mode);
  const sid = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + MAX_AGE_SECONDS * 1000);
  await db.insert(schema.sessions).values({ id: sid, userId, expiresAt });
  // Tidy up: this user's expired sessions.
  await db.delete(schema.sessions).where(and(eq(schema.sessions.userId, userId), lt(schema.sessions.expiresAt, new Date())));
  const token = await new SignJWT({ userId, sv: version, sid, mode })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE_SECONDS}s`)
    .sign(sessionKey());
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  });
}

/** Signs this browser out: the session row is deleted, so the cookie is useless even if copied. */
export async function destroySession() {
  const session = await readSession();
  if (session) {
    const db = await getDb();
    await db.delete(schema.sessions).where(eq(schema.sessions.id, session.sid));
  }
  (await cookies()).delete(SESSION_COOKIE);
}

/** Ends every session of a user, optionally keeping one (e.g. the browser that changed the password). */
export async function endUserSessions(userId: string, keepSid?: string) {
  const db = await getDb();
  await db.delete(schema.sessions).where(and(eq(schema.sessions.userId, userId), keepSid ? ne(schema.sessions.id, keepSid) : undefined));
}
