"use server";

import { and, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { refresh } from "next/cache";
import { getDb, schema } from "@/db";
import { requireUser } from "@/lib/auth";
import type { ActionState } from "@/components/forms";
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

  const db = await getDb();
  const [row] = await db.insert(schema.customers).values(data).returning({ id: schema.customers.id });
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

export async function addVehicle(_: ActionState, formData: FormData): Promise<ActionState> {
  const lang = langFrom(formData);
  await requireUser(lang);
  const customerId = str(formData, "customerId");
  const make = str(formData, "make");
  const model = str(formData, "model");
  const plateNumber = str(formData, "plateNumber").toUpperCase();
  const year = intOrNull(str(formData, "year"));
  if (!UUID_RE.test(customerId)) return { error: t(lang).common.errorGeneric };
  if (!make || !model || !plateNumber) return { error: t(lang).common.required };

  const db = await getDb();
  await db.insert(schema.vehicles).values({
    customerId,
    make,
    model,
    plateNumber,
    year: year && year > 1950 && year < 2100 ? year : null,
    color: optStr(formData, "color"),
    vin: optStr(formData, "vin")?.toUpperCase() ?? null,
  });

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
