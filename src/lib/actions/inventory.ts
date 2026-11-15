"use server";

import { and, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { refresh } from "next/cache";
import { getDb, schema } from "@/db";
import { requirePermission } from "@/lib/auth";
import { moveStock } from "@/lib/inventory";
import type { ActionState } from "@/components/forms";
import type { InventoryUnit } from "@/db/schema";
import { kwdToFils, langFrom, optStr, qtyToMilli, str, t, UUID_RE } from "./helpers";
import { audit, changes } from "@/lib/audit";

async function itemName(id: string) {
  const db = await getDb();
  const [i] = await db.select({ name: schema.inventoryItems.nameEn }).from(schema.inventoryItems).where(eq(schema.inventoryItems.id, id)).limit(1);
  return i?.name ?? null;
}

const UNITS: InventoryUnit[] = ["piece", "roll", "meter", "sqm", "ml", "liter", "box", "pack"];

export async function saveInventoryItem(_: ActionState, formData: FormData): Promise<ActionState> {
  const lang = langFrom(formData);
  const user = await requirePermission(lang, "inventory.manage");
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
    const [before] = await db.select().from(schema.inventoryItems).where(eq(schema.inventoryItems.id, id)).limit(1);
    // A hand-entered cost replaces the running average; an unchanged one keeps its precision.
    const avg = before && before.unitCostFils !== unitCostFils ? { avgCostFils: unitCostFils } : {};
    await db.update(schema.inventoryItems).set({ ...values, ...avg }).where(eq(schema.inventoryItems.id, id));
    await audit("inventory.update", { type: "inventory", id, label: nameEn }, changes(before, values, ["nameEn", "nameAr", "unit", "sku", "reorderLevelMilli", "unitCostFils", "active"]));
    redirect(`/${lang}/inventory/${id}`);
  }
  const [item] = await db.insert(schema.inventoryItems).values({ ...values, avgCostFils: unitCostFils }).returning({ id: schema.inventoryItems.id });
  const opening = qtyToMilli(str(formData, "openingStock"));
  await audit("inventory.create", { type: "inventory", id: item.id, label: nameEn }, { quantity: opening ? opening / 1000 : 0, unitCostFils });
  if (opening) {
    await moveStock(db, { itemId: item.id, deltaMilli: opening, reason: "restock", userId: user.id, note: dict.inventory.openingStock });
  }
  redirect(`/${lang}/inventory/${item.id}`);
}

/** Front desk and admins can receive deliveries. */
export async function receiveStock(_: ActionState, formData: FormData): Promise<ActionState> {
  const lang = langFrom(formData);
  const user = await requirePermission(lang, "inventory.receive");
  const itemId = str(formData, "itemId");
  const qty = qtyToMilli(str(formData, "quantity"));
  if (!UUID_RE.test(itemId) || !qty || qty <= 0) return { error: t(lang).inventory.invalidQty };
  const costRaw = str(formData, "totalCost");
  const total = costRaw === "" ? null : kwdToFils(costRaw);
  if (costRaw !== "" && total === null) return { error: t(lang).inventory.invalidCost };
  const method = str(formData, "paidWith");
  const paidWith = (["cash", "knet", "card", "transfer"] as const).find((m) => m === method) ?? null;
  const db = await getDb();
  await moveStock(db, {
    itemId,
    deltaMilli: qty,
    reason: "restock",
    userId: user.id,
    note: optStr(formData, "note"),
    purchaseTotalFils: total,
    supplier: optStr(formData, "supplier"),
    paidWith: paidWith ?? "cash",
  });
  await audit("inventory.receive", { type: "inventory", id: itemId, label: await itemName(itemId) }, { quantity: qty / 1000, totalFils: total, supplier: optStr(formData, "supplier") });
  refresh();
  return undefined;
}

/** Admins set the counted quantity; the difference is recorded as a correction. */
export async function adjustStock(_: ActionState, formData: FormData): Promise<ActionState> {
  const lang = langFrom(formData);
  const user = await requirePermission(lang, "inventory.manage");
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
  await audit("inventory.adjust", { type: "inventory", id: itemId, label: item.nameEn }, { quantity: [item.onHandMilli / 1000, counted / 1000], notes: optStr(formData, "note") });
  refresh();
  return undefined;
}

export async function setServiceMaterial(_: ActionState, formData: FormData): Promise<ActionState> {
  const lang = langFrom(formData);
  await requirePermission(lang, "services.manage");
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
  const [svc] = await db.select({ name: schema.services.nameEn }).from(schema.services).where(eq(schema.services.id, serviceId)).limit(1);
  await audit("service.material", { type: "service", id: serviceId, label: svc?.name }, { item: await itemName(itemId), quantity: qty / 1000 });
  refresh();
  return undefined;
}

export async function removeServiceMaterial(formData: FormData) {
  const lang = langFrom(formData);
  await requirePermission(lang, "services.manage");
  const id = str(formData, "id");
  const serviceId = str(formData, "serviceId");
  if (!UUID_RE.test(id) || !UUID_RE.test(serviceId)) return;
  const db = await getDb();
  const gone = await db
    .delete(schema.serviceMaterials)
    .where(and(eq(schema.serviceMaterials.id, id), eq(schema.serviceMaterials.serviceId, serviceId)))
    .returning({ itemId: schema.serviceMaterials.itemId });
  if (gone[0]) {
    const [svc] = await db.select({ name: schema.services.nameEn }).from(schema.services).where(eq(schema.services.id, serviceId)).limit(1);
    await audit("service.removeMaterial", { type: "service", id: serviceId, label: svc?.name }, { item: await itemName(gone[0].itemId) });
  }
  refresh();
}
