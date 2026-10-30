"use server";

import bcrypt from "bcryptjs";
import { and, eq, ne } from "drizzle-orm";
import { redirect } from "next/navigation";
import { refresh } from "next/cache";
import { getDb, schema } from "@/db";
import { requireAdmin } from "@/lib/auth";
import type { ActionState } from "@/components/forms";
import type { ServiceCategory, UserRole } from "@/db/schema";
import { intOrNull, kwdToFils, langFrom, str, t, UUID_RE } from "./helpers";

const CATEGORIES: ServiceCategory[] = ["ppf", "ceramic", "tint", "detailing", "other"];
const ROLES: UserRole[] = ["admin", "staff", "technician"];

export async function saveService(_: ActionState, formData: FormData): Promise<ActionState> {
  const lang = langFrom(formData);
  await requireAdmin(lang);
  const dict = t(lang);
  const id = str(formData, "id");
  const nameEn = str(formData, "nameEn");
  const nameAr = str(formData, "nameAr");
  const category = str(formData, "category") as ServiceCategory;
  const priceFils = kwdToFils(str(formData, "price"));
  const warrantyMonths = intOrNull(str(formData, "warrantyMonths")) ?? 0;
  if (!nameEn || !nameAr || !CATEGORIES.includes(category) || priceFils === null || warrantyMonths < 0) {
    return { error: dict.common.required };
  }
  const values = { nameEn, nameAr, category, priceFils, warrantyMonths, active: formData.get("active") === "on" };

  const db = await getDb();
  if (UUID_RE.test(id)) {
    await db.update(schema.services).set(values).where(eq(schema.services.id, id));
  } else {
    await db.insert(schema.services).values(values);
  }
  redirect(`/${lang}/services`);
}

export async function createUser(_: ActionState, formData: FormData): Promise<ActionState> {
  const lang = langFrom(formData);
  await requireAdmin(lang);
  const dict = t(lang);
  const name = str(formData, "name");
  const email = str(formData, "email").toLowerCase();
  const password = str(formData, "password");
  const role = str(formData, "role") as UserRole;
  if (!name || !email || password.length < 8 || !ROLES.includes(role)) return { error: dict.common.required };

  const db = await getDb();
  const [taken] = await db.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.email, email)).limit(1);
  if (taken) return { error: dict.users.emailTaken };

  await db.insert(schema.users).values({ name, email, role, passwordHash: await bcrypt.hash(password, 10) });
  redirect(`/${lang}/users`);
}

export async function toggleUserActive(formData: FormData) {
  const lang = langFrom(formData);
  const me = await requireAdmin(lang);
  const id = str(formData, "id");
  if (!UUID_RE.test(id) || id === me.id) return;
  const db = await getDb();
  const [u] = await db.select({ active: schema.users.active }).from(schema.users).where(eq(schema.users.id, id)).limit(1);
  if (!u) return;
  await db
    .update(schema.users)
    .set({ active: !u.active })
    .where(and(eq(schema.users.id, id), ne(schema.users.id, me.id)));
  refresh();
}
