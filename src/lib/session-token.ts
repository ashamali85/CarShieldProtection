import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { jwtVerify } from "jose";

/**
 * Reading and checking the signed session cookie, with no database access, so the database layer
 * can use it to pick which database a request belongs to (see src/db/index.ts).
 */
export const SESSION_COOKIE = "csp_session";

/** "live" is the real shop; "training" is the separate practice copy used by demo accounts. */
export type DbMode = "live" | "training";

export type SessionPayload = { userId: string; version: number; sid: string; mode: DbMode };

export function sessionKey() {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("SESSION_SECRET must be set to at least 32 characters.");
  }
  return new TextEncoder().encode(secret);
}

/** The verified session from the cookie, once per request. */
export const readSession = cache(async (): Promise<SessionPayload | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, sessionKey(), { algorithms: ["HS256"] });
    // Tokens without a server-side session (issued before sessions were stored) are no longer accepted.
    if (typeof payload.userId !== "string" || typeof payload.sid !== "string") return null;
    return {
      userId: payload.userId,
      version: typeof payload.sv === "number" ? payload.sv : 0,
      sid: payload.sid,
      // The mode is inside the signed token, so it can't be changed by the browser.
      mode: payload.mode === "training" ? "training" : "live",
    };
  } catch {
    return null;
  }
});

/** Which database this request uses: training only for a signed-in demo account. */
export async function currentMode(): Promise<DbMode> {
  return (await readSession())?.mode ?? "live";
}
