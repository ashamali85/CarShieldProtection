"use server";

import bcrypt from "bcryptjs";
import { and, eq, ne } from "drizzle-orm";
import { redirect } from "next/navigation";
import { refresh } from "next/cache";
import { getDb, schema } from "@/db";
import { requirePermission } from "@/lib/auth";
import type { ActionState } from "@/components/forms";
import type { ServiceCategory, UserRole } from "@/db/schema";
import { canGrant } from "@/lib/roles";
import { intOrNull, kwdToFils, langFrom, str, t, UUID_RE } from "./helpers";

const CATEGORIES: ServiceCategory[] = ["ppf", "ceramic", "tint", "detailing", "other"];

export async function saveService(_: ActionState, formData: FormData): Promise<ActionState> {
  const lang = langFrom(formData);
  await requirePermission(lang, "services.manage");
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
  const me = await requirePermission(lang, "users.manage");
  const dict = t(lang);
  const name = str(formData, "name");
  const email = str(formData, "email").toLowerCase();
  const password = str(formData, "password");
  const roleId = str(formData, "roleId");
  if (!name || !email || password.length < 8 || !UUID_RE.test(roleId)) return { error: dict.common.required };

  const db = await getDb();
  const [role] = await db.select().from(schema.roles).where(eq(schema.roles.id, roleId)).limit(1);
  if (!role) return { error: dict.common.required };
  if (!(canGrant(me, role))) return { error: dict.users.notAllowed };
  const [taken] = await db.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.email, email)).limit(1);
  if (taken) return { error: dict.users.emailTaken };

  // The legacy role column follows the built-in roles where it can.
  const legacy: UserRole = role.key === "admin" ? "admin" : role.key === "technician" ? "technician" : "staff";
  await db.insert(schema.users).values({ name, email, role: legacy, roleId, passwordHash: await bcrypt.hash(password, 10) });
  redirect(`/${lang}/users`);
}

export async function toggleUserActive(formData: FormData) {
  const lang = langFrom(formData);
  const me = await requirePermission(lang, "users.manage");
  const id = str(formData, "id");
  if (!UUID_RE.test(id) || id === me.id) return;
  const db = await getDb();
  const [u] = await db
    .select({ active: schema.users.active, system: schema.roles.system, permissions: schema.roles.permissions })
    .from(schema.users)
    .innerJoin(schema.roles, eq(schema.roles.id, schema.users.roleId))
    .where(eq(schema.users.id, id))
    .limit(1);
  // You can't switch off someone with more access than you.
  if (!u || !(canGrant(me, u))) return;
  await db
    .update(schema.users)
    .set({ active: !u.active })
    .where(and(eq(schema.users.id, id), ne(schema.users.id, me.id)));
  refresh();
}
