"use server";

import { and, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { refresh } from "next/cache";
import { getDb, schema } from "@/db";
import { requireAdmin, requireUser } from "@/lib/auth";
import { moveStock } from "@/lib/inventory";
import type { ActionState } from "@/components/forms";
import type { InventoryUnit } from "@/db/schema";
import { kwdToFils, langFrom, optStr, qtyToMilli, str, t, UUID_RE } from "./helpers";

const UNITS: InventoryUnit[] = ["piece", "roll", "meter", "sqm", "ml", "liter", "box", "pack"];

export async function saveInventoryItem(_: ActionState, formData: FormData): Promise<ActionState> {
  const lang = langFrom(formData);
  const user = await requireAdmin(lang);
  const dict = t(lang);
  const id = str(formData, "id");
  const nameEn = str(formData, "nameEn");
  const nameAr = str(formData, "nameAr");
  const unit = str(formData, "unit") as InventoryUnit;
  const reorder = qtyToMilli(str(formData, "reorderLevel")) ?? 0;
  const costRaw = str(formData, "unitCost");
  const unitCostFils = costRaw === "" ? null : kwdToFils(costRaw);
  if (!nameEn || !nameAr || !UNITS.includes(unit) || (costRaw !== "" && unitCostFils === null)) {
    return { error: dict.common.required };
  }
  const values = {
    nameEn,
    nameAr,
    unit,
    sku: optStr(formData, "sku"),
    reorderLevelMilli: reorder,
    unitCostFils,
    active: formData.get("active") === "on",
  };

  const db = await getDb();
  if (UUID_RE.test(id)) {
    await db.update(schema.inventoryItems).set(values).where(eq(schema.inventoryItems.id, id));
    redirect(`/${lang}/inventory/${id}`);
  }
  const [item] = await db.insert(schema.inventoryItems).values(values).returning({ id: schema.inventoryItems.id });
  const opening = qtyToMilli(str(formData, "openingStock"));
  if (opening) {
    await moveStock(db, { itemId: item.id, deltaMilli: opening, reason: "restock", userId: user.id, note: dict.inventory.openingStock });
  }
  redirect(`/${lang}/inventory/${item.id}`);
}

/** Front desk and admins can receive deliveries. */
export async function receiveStock(_: ActionState, formData: FormData): Promise<ActionState> {
  const lang = langFrom(formData);
  const user = await requireUser(lang);
  const itemId = str(formData, "itemId");
  const qty = qtyToMilli(str(formData, "quantity"));
  if (!UUID_RE.test(itemId) || !qty || qty <= 0) return { error: t(lang).inventory.invalidQty };
  const db = await getDb();
  await moveStock(db, { itemId, deltaMilli: qty, reason: "restock", userId: user.id, note: optStr(formData, "note") });
  refresh();
  return undefined;
}

/** Admins set the counted quantity; the difference is recorded as a correction. */
export async function adjustStock(_: ActionState, formData: FormData): Promise<ActionState> {
  const lang = langFrom(formData);
  const user = await requireAdmin(lang);
  const itemId = str(formData, "itemId");
  const counted = qtyToMilli(str(formData, "counted"));
  if (!UUID_RE.test(itemId) || counted === null || counted < 0) return { error: t(lang).inventory.invalidQty };
  const db = await getDb();
  const [item] = await db.select().from(schema.inventoryItems).where(eq(schema.inventoryItems.id, itemId)).limit(1);
  if (!item) return { error: t(lang).common.errorGeneric };
  await moveStock(db, {
    itemId,
    deltaMilli: counted - item.onHandMilli,
    reason: "adjustment",
    userId: user.id,
    note: optStr(formData, "note"),
  });
  refresh();
  return undefined;
}

export async function setServiceMaterial(_: ActionState, formData: FormData): Promise<ActionState> {
  const lang = langFrom(formData);
  await requireAdmin(lang);
  const serviceId = str(formData, "serviceId");
  const itemId = str(formData, "itemId");
  const qty = qtyToMilli(str(formData, "quantity"));
  if (!UUID_RE.test(serviceId) || !UUID_RE.test(itemId)) return { error: t(lang).inventory.chooseItem };
  if (!qty || qty <= 0) return { error: t(lang).inventory.invalidQty };
  const db = await getDb();
  await db
    .insert(schema.serviceMaterials)
    .values({ serviceId, itemId, quantityMilli: qty })
    .onConflictDoUpdate({
      target: [schema.serviceMaterials.serviceId, schema.serviceMaterials.itemId],
      set: { quantityMilli: qty },
    });
  refresh();
  return undefined;
}

export async function removeServiceMaterial(formData: FormData) {
  const lang = langFrom(formData);
  await requireAdmin(lang);
  const id = str(formData, "id");
  const serviceId = str(formData, "serviceId");
  if (!UUID_RE.test(id) || !UUID_RE.test(serviceId)) return;
  const db = await getDb();
  await db
    .delete(schema.serviceMaterials)
    .where(and(eq(schema.serviceMaterials.id, id), eq(schema.serviceMaterials.serviceId, serviceId)));
  refresh();
}
