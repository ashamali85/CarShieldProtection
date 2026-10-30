"use server";

import { and, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { refresh } from "next/cache";
import { getDb, schema } from "@/db";
import { requireUser } from "@/lib/auth";
import type { ActionState } from "@/components/forms";
import type { BodyType } from "@/db/schema";
import { intOrNull, langFrom, optStr, str, t, UUID_RE } from "./helpers";

function customerFields(formData: FormData) {
  return {
    name: str(formData, "name"),
    phone: str(formData, "phone"),
    email: optStr(formData, "email")?.toLowerCase() ?? null,
    civilId: optStr(formData, "civilId"),
    notes: optStr(formData, "notes"),
  };
}

export async function createCustomer(_: ActionState, formData: FormData): Promise<ActionState> {
  const lang = langFrom(formData);
  await requireUser(lang);
  const data = customerFields(formData);
  if (!data.name || !data.phone) return { error: t(lang).common.required };

  // Every customer comes with their car; check it before saving anything.
  const vehicle = await parseVehicle(formData);
  if (!vehicle) return { error: t(lang).vehicles.carRequired };

  const db = await getDb();
  const [row] = await db.insert(schema.customers).values(data).returning({ id: schema.customers.id });
  await db.insert(schema.vehicles).values({ ...vehicle, customerId: row.id });
  redirect(`/${lang}/customers/${row.id}`);
}

export async function updateCustomer(_: ActionState, formData: FormData): Promise<ActionState> {
  const lang = langFrom(formData);
  await requireUser(lang);
  const id = str(formData, "id");
  const data = customerFields(formData);
  if (!UUID_RE.test(id)) return { error: t(lang).common.errorGeneric };
  if (!data.name || !data.phone) return { error: t(lang).common.required };

  const db = await getDb();
  await db.update(schema.customers).set(data).where(eq(schema.customers.id, id));
  redirect(`/${lang}/customers/${id}`);
}

/**
 * Reads the vehicle picker fields. A catalog pick (modelId) fills brand, model
 * and body type from the catalog; "Other" uses the typed names.
 */
async function parseVehicle(formData: FormData) {
  const makeId = str(formData, "makeId");
  const modelId = str(formData, "modelId");
  const plateNumber = str(formData, "plateNumber").toUpperCase();
  const year = intOrNull(str(formData, "year"));
  const maxYear = new Date().getFullYear() + 1;
  if (!plateNumber || !year || year < 1950 || year > maxYear) return null;

  const extra = {
    plateNumber,
    year,
    color: optStr(formData, "color"),
    vin: optStr(formData, "vin")?.toUpperCase() ?? null,
  };

  if (UUID_RE.test(modelId)) {
    const db = await getDb();
    const [row] = await db
      .select({ model: schema.carModels, make: schema.carMakes })
      .from(schema.carModels)
      .innerJoin(schema.carMakes, eq(schema.carModels.makeId, schema.carMakes.id))
      .where(and(eq(schema.carModels.id, modelId), eq(schema.carModels.makeId, makeId)))
      .limit(1);
    if (!row) return null;
    return { ...extra, make: row.make.name, model: row.model.name, modelId: row.model.id, bodyType: row.model.bodyType };
  }

  // "Other": a catalog brand with a typed model, or a typed brand and model.
  const bodyType = str(formData, "bodyType") as BodyType;
  if (!BODY_TYPES.includes(bodyType)) return null;
  const modelName = str(formData, "modelName");
  let makeName = str(formData, "makeName");
  if (UUID_RE.test(makeId)) {
    const db = await getDb();
    const [make] = await db.select().from(schema.carMakes).where(eq(schema.carMakes.id, makeId)).limit(1);
    makeName = make?.name ?? "";
  }
  if (!makeName || !modelName) return null;
  return { ...extra, make: makeName, model: modelName, modelId: null, bodyType };
}

const BODY_TYPES: BodyType[] = ["sedan", "hatchback", "coupe", "convertible", "suv", "pickup", "van", "minivan", "wagon"];

export async function addVehicle(_: ActionState, formData: FormData): Promise<ActionState> {
  const lang = langFrom(formData);
  await requireUser(lang);
  const customerId = str(formData, "customerId");
  if (!UUID_RE.test(customerId)) return { error: t(lang).common.errorGeneric };
  const vehicle = await parseVehicle(formData);
  if (!vehicle) return { error: t(lang).vehicles.carRequired };

  const db = await getDb();
  await db.insert(schema.vehicles).values({ ...vehicle, customerId });

  const next = str(formData, "next");
  if (next === "job") redirect(`/${lang}/jobs/new?customer=${customerId}`);
  refresh();
  return undefined;
}

export async function deleteVehicle(formData: FormData) {
  const lang = langFrom(formData);
  await requireUser(lang);
  const id = str(formData, "id");
  const customerId = str(formData, "customerId");
  if (!UUID_RE.test(id) || !UUID_RE.test(customerId)) return;
  const db = await getDb();
  const used = await db.select({ id: schema.jobs.id }).from(schema.jobs).where(eq(schema.jobs.vehicleId, id)).limit(1);
  // Vehicles with job history are kept so records stay intact.
  if (used.length === 0) {
    await db
      .delete(schema.vehicles)
      .where(and(eq(schema.vehicles.id, id), eq(schema.vehicles.customerId, customerId)));
  }
  refresh();
}
