"use server";

import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { getDb, schema } from "@/db";
import { createSession, destroySession } from "@/lib/session";
import type { ActionState } from "@/components/forms";
import { langFrom, str, t } from "./helpers";

export async function login(_: ActionState, formData: FormData): Promise<ActionState> {
  const lang = langFrom(formData);
  const email = str(formData, "email").toLowerCase();
  const password = str(formData, "password");
  if (!email || !password) return { error: t(lang).common.required };

  const db = await getDb();
  const [user] = await db.select().from(schema.users).where(eq(schema.users.email, email)).limit(1);
  const ok = user && user.active && (await bcrypt.compare(password, user.passwordHash));
  if (!ok) return { error: t(lang).login.invalid };

  await createSession(user.id);
  redirect(`/${lang}`);
}

export async function logout(formData: FormData) {
  const lang = langFrom(formData);
  await destroySession();
  redirect(`/${lang}/login`);
}
