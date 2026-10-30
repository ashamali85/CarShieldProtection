"use server";

import { and, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { refresh } from "next/cache";
import { getDb, schema } from "@/db";
import { requireAdmin } from "@/lib/auth";
import type { ActionState } from "@/components/forms";
import type { BodyType } from "@/db/schema";
import { intOrNull, langFrom, str, t, UUID_RE } from "./helpers";

const BODY_TYPES: BodyType[] = ["sedan", "hatchback", "coupe", "convertible", "suv", "pickup", "van", "minivan", "wagon"];

export async function addMake(_: ActionState, formData: FormData): Promise<ActionState> {
  const lang = langFrom(formData);
  await requireAdmin(lang);
  const name = str(formData, "name");
  const nameAr = str(formData, "nameAr");
  if (!name || !nameAr) return { error: t(lang).common.required };
  const db = await getDb();
  const [row] = await db.insert(schema.carMakes).values({ name, nameAr }).onConflictDoNothing().returning({ id: schema.carMakes.id });
  if (!row) return { error: t(lang).catalog.brandExists };
  redirect(`/${lang}/catalog/${row.id}`);
}

export async function addModel(_: ActionState, formData: FormData): Promise<ActionState> {
  const lang = langFrom(formData);
  await requireAdmin(lang);
  const makeId = str(formData, "makeId");
  const name = str(formData, "name");
  const bodies = formData.getAll("bodyType").map(String).filter((b): b is BodyType => BODY_TYPES.includes(b as BodyType));
  const maxYear = new Date().getFullYear() + 2;
  const yearFrom = intOrNull(str(formData, "yearFrom"));
  const yearTo = intOrNull(str(formData, "yearTo"));
  const validRange = yearFrom !== null && yearFrom >= 1950 && yearFrom <= maxYear && (yearTo === null || (yearTo >= yearFrom && yearTo <= maxYear));
  if (!UUID_RE.test(makeId) || !name || bodies.length === 0 || !validRange) return { error: t(lang).catalog.invalidModel };

  const db = await getDb();
  await db
    .insert(schema.carModels)
    .values(bodies.map((bodyType) => ({ makeId, name, bodyType, yearFrom: yearFrom!, yearTo })))
    .onConflictDoUpdate({
      target: [schema.carModels.makeId, schema.carModels.name, schema.carModels.bodyType],
      set: { yearFrom: yearFrom!, yearTo, active: true },
    });
  refresh();
  return undefined;
}

/** Hidden models stay linked to existing vehicles but no longer appear in the picker. */
export async function toggleModel(formData: FormData) {
  const lang = langFrom(formData);
  await requireAdmin(lang);
  const id = str(formData, "id");
  const makeId = str(formData, "makeId");
  if (!UUID_RE.test(id) || !UUID_RE.test(makeId)) return;
  const db = await getDb();
  const [m] = await db.select({ active: schema.carModels.active }).from(schema.carModels).where(eq(schema.carModels.id, id)).limit(1);
  if (!m) return;
  await db
    .update(schema.carModels)
    .set({ active: !m.active })
    .where(and(eq(schema.carModels.id, id), eq(schema.carModels.makeId, makeId)));
  refresh();
}

export async function toggleMake(formData: FormData) {
  const lang = langFrom(formData);
  await requireAdmin(lang);
  const id = str(formData, "id");
  if (!UUID_RE.test(id)) return;
  const db = await getDb();
  const [m] = await db.select({ active: schema.carMakes.active }).from(schema.carMakes).where(eq(schema.carMakes.id, id)).limit(1);
  if (!m) return;
  await db.update(schema.carMakes).set({ active: !m.active }).where(eq(schema.carMakes.id, id));
  refresh();
}
