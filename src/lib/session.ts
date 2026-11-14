import "server-only";
import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { and, eq, lt, ne } from "drizzle-orm";
import { SignJWT, jwtVerify } from "jose";
import { getDb, schema } from "@/db";

export const SESSION_COOKIE = "csp_session";
const MAX_AGE_SECONDS = 60 * 60 * 12; // one working day

function key() {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("SESSION_SECRET must be set to at least 32 characters.");
  }
  return new TextEncoder().encode(secret);
}

/**
 * The cookie is a signed token naming the user, a server-side session row (sid) and the user's
 * session version. A page or action only accepts it while that row still exists (see auth.ts), so
 * signing out, a password change or deleting the user ends it immediately.
 */
export type SessionPayload = { userId: string; version: number; sid: string };

export async function createSession(userId: string, version: number) {
  const db = await getDb();
  const sid = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + MAX_AGE_SECONDS * 1000);
  await db.insert(schema.sessions).values({ id: sid, userId, expiresAt });
  // Tidy up: this user's expired sessions.
  await db.delete(schema.sessions).where(and(eq(schema.sessions.userId, userId), lt(schema.sessions.expiresAt, new Date())));
  const token = await new SignJWT({ userId, sv: version, sid })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE_SECONDS}s`)
    .sign(key());
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  });
}

export async function readSession(): Promise<SessionPayload | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, key(), { algorithms: ["HS256"] });
    // Tokens without a server-side session (issued before sessions were stored) are no longer accepted.
    if (typeof payload.userId !== "string" || typeof payload.sid !== "string") return null;
    return { userId: payload.userId, version: typeof payload.sv === "number" ? payload.sv : 0, sid: payload.sid };
  } catch {
    return null;
  }
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
