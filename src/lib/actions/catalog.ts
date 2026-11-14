"use server";

import { and, eq, ne } from "drizzle-orm";
import { redirect } from "next/navigation";
import { refresh } from "next/cache";
import { getDb, schema } from "@/db";
import { requirePermission } from "@/lib/auth";
import type { ActionState } from "@/components/forms";
import type { BodyType } from "@/db/schema";
import { intOrNull, langFrom, str, t, UUID_RE } from "./helpers";

const BODY_TYPES: BodyType[] = ["sedan", "hatchback", "coupe", "convertible", "suv", "pickup", "van", "minivan", "wagon"];

export async function addMake(_: ActionState, formData: FormData): Promise<ActionState> {
  const lang = langFrom(formData);
  await requirePermission(lang, "catalog.manage");
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
  await requirePermission(lang, "catalog.manage");
  const makeId = str(formData, "makeId");
  const name = str(formData, "name");
  const bodies = formData.getAll("bodyType").map(String).filter((b): b is BodyType => BODY_TYPES.includes(b as BodyType));
  const yearFrom = intOrNull(str(formData, "yearFrom"));
  const yearTo = intOrNull(str(formData, "yearTo"));
  if (!UUID_RE.test(makeId) || !name || bodies.length === 0) return { error: t(lang).catalog.invalidModel };
  if (!validYears(yearFrom, yearTo)) return { error: t(lang).catalog.invalidYears };

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
  await requirePermission(lang, "catalog.manage");
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
  await requirePermission(lang, "catalog.manage");
  const id = str(formData, "id");
  if (!UUID_RE.test(id)) return;
  const db = await getDb();
  const [m] = await db.select({ active: schema.carMakes.active }).from(schema.carMakes).where(eq(schema.carMakes.id, id)).limit(1);
  if (!m) return;
  await db.update(schema.carMakes).set({ active: !m.active }).where(eq(schema.carMakes.id, id));
  refresh();
}

const LOGO_TYPES = ["image/png", "image/jpeg", "image/webp"];
const LOGO_MAX_BYTES = 200 * 1024;

/** Reads an optional uploaded logo. `undefined` = nothing uploaded, `{ error }` = rejected. */
async function readLogo(formData: FormData, lang: Parameters<typeof t>[0]): Promise<string | undefined | { error: string }> {
  const file = formData.get("logo");
  if (!(file instanceof File) || file.size === 0) return undefined;
  if (!LOGO_TYPES.includes(file.type)) return { error: t(lang).catalog.logoType };
  if (file.size > LOGO_MAX_BYTES) return { error: t(lang).catalog.logoTooBig };
  const bytes = Buffer.from(await file.arrayBuffer());
  // Trust the file's content, not the type the browser claims.
  const type = imageType(bytes);
  if (!type) return { error: t(lang).catalog.logoType };
  return `data:${type};base64,${bytes.toString("base64")}`;
}

/** Recognises PNG, JPEG and WebP by their first bytes. */
function imageType(b: Buffer): string | null {
  if (b.length >= 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b.length >= 12 && b.toString("ascii", 0, 4) === "RIFF" && b.toString("ascii", 8, 12) === "WEBP") return "image/webp";
  return null;
}

function validYears(yearFrom: number | null, yearTo: number | null) {
  const maxYear = new Date().getFullYear() + 2;
  return yearFrom !== null && yearFrom >= 1950 && yearFrom <= maxYear && (yearTo === null || (yearTo >= yearFrom && yearTo <= maxYear));
}

export async function updateMake(_: ActionState, formData: FormData): Promise<ActionState> {
  const lang = langFrom(formData);
  await requirePermission(lang, "catalog.manage");
  const id = str(formData, "id");
  const name = str(formData, "name");
  const nameAr = str(formData, "nameAr");
  if (!UUID_RE.test(id) || !name || !nameAr) return { error: t(lang).common.required };

  const logo = await readLogo(formData, lang);
  if (typeof logo === "object") return logo;

  const db = await getDb();
  const [clash] = await db
    .select({ id: schema.carMakes.id })
    .from(schema.carMakes)
    .where(and(eq(schema.carMakes.name, name), ne(schema.carMakes.id, id)))
    .limit(1);
  if (clash) return { error: t(lang).catalog.brandExists };

  const set: Partial<typeof schema.carMakes.$inferInsert> = { name, nameAr };
  if (logo) set.logoUrl = logo;
  else if (formData.get("removeLogo") === "1") set.logoUrl = null;
  await db.update(schema.carMakes).set(set).where(eq(schema.carMakes.id, id));
  refresh();
  return undefined;
}

/** Deletes a brand and (by cascade) its models. Linked vehicles keep their make/model text; their model link is cleared. */
export async function deleteMake(_: ActionState, formData: FormData): Promise<ActionState> {
  const lang = langFrom(formData);
  await requirePermission(lang, "catalog.manage");
  const id = str(formData, "id");
  if (!UUID_RE.test(id)) return { error: t(lang).common.required };
  const db = await getDb();
  await db.delete(schema.carMakes).where(eq(schema.carMakes.id, id));
  redirect(`/${lang}/catalog`);
}

export async function updateModel(_: ActionState, formData: FormData): Promise<ActionState> {
  const lang = langFrom(formData);
  await requirePermission(lang, "catalog.manage");
  const id = str(formData, "id");
  const makeId = str(formData, "makeId");
  const name = str(formData, "name");
  const bodyType = str(formData, "bodyType") as BodyType;
  const yearFrom = intOrNull(str(formData, "yearFrom"));
  const yearTo = intOrNull(str(formData, "yearTo"));
  if (!UUID_RE.test(id) || !UUID_RE.test(makeId) || !name || !BODY_TYPES.includes(bodyType)) {
    return { error: t(lang).catalog.invalidModel };
  }
  if (!validYears(yearFrom, yearTo)) return { error: t(lang).catalog.invalidYears };
  const db = await getDb();
  const [clash] = await db
    .select({ id: schema.carModels.id })
    .from(schema.carModels)
    .where(
      and(
        eq(schema.carModels.makeId, makeId),
        eq(schema.carModels.name, name),
        eq(schema.carModels.bodyType, bodyType),
        ne(schema.carModels.id, id),
      ),
    )
    .limit(1);
  if (clash) return { error: t(lang).catalog.modelExists };
  await db
    .update(schema.carModels)
    .set({ name, bodyType, yearFrom: yearFrom!, yearTo })
    .where(and(eq(schema.carModels.id, id), eq(schema.carModels.makeId, makeId)));
  refresh();
  return undefined;
}

export async function deleteModel(_: ActionState, formData: FormData): Promise<ActionState> {
  const lang = langFrom(formData);
  await requirePermission(lang, "catalog.manage");
  const id = str(formData, "id");
  const makeId = str(formData, "makeId");
  if (!UUID_RE.test(id) || !UUID_RE.test(makeId)) return { error: t(lang).common.required };
  const db = await getDb();
  await db.delete(schema.carModels).where(and(eq(schema.carModels.id, id), eq(schema.carModels.makeId, makeId)));
  refresh();
  return undefined;
}
