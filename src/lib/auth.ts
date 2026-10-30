import "server-only";
import { cache } from "react";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { getDb, schema } from "@/db";
import { readSession } from "./session";
import type { Locale } from "@/i18n";
import type { UserRole } from "@/db/schema";

export type CurrentUser = { id: string; name: string; email: string; role: UserRole };

/** Reads the session cookie and loads the user once per request. */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const session = await readSession();
  if (!session) return null;
  const db = await getDb();
  const [user] = await db
    .select({
      id: schema.users.id,
      name: schema.users.name,
      email: schema.users.email,
      role: schema.users.role,
      active: schema.users.active,
    })
    .from(schema.users)
    .where(eq(schema.users.id, session.userId))
    .limit(1);
  if (!user || !user.active) return null;
  return { id: user.id, name: user.name, email: user.email, role: user.role };
});

/** Use in every page body and Server Action: the proxy check alone is not authorization. */
export async function requireUser(lang: Locale): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect(`/${lang}/login`);
  return user;
}

export async function requireAdmin(lang: Locale): Promise<CurrentUser> {
  const user = await requireUser(lang);
  if (user.role !== "admin") redirect(`/${lang}?denied=1`);
  return user;
}
