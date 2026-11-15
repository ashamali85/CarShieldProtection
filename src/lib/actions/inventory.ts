"use server";

import { and, count, eq, isNull } from "drizzle-orm";
import { redirect } from "next/navigation";
import { refresh } from "next/cache";
import { getDb, schema } from "@/db";
import { requirePermission } from "@/lib/auth";
import { moveStock, reviseMovement } from "@/lib/inventory";
import { todayKuwait } from "@/lib/dates";
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
    if (!before || before.deletedAt) return { error: dict.inventory.deletedLocked };
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
  const [live] = await db.select({ deletedAt: schema.inventoryItems.deletedAt }).from(schema.inventoryItems).where(eq(schema.inventoryItems.id, itemId)).limit(1);
  if (!live || live.deletedAt) return { error: t(lang).inventory.deletedLocked };
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
  if (item.deletedAt) return { error: t(lang).inventory.deletedLocked };
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
  const [live] = await db.select({ deletedAt: schema.inventoryItems.deletedAt }).from(schema.inventoryItems).where(eq(schema.inventoryItems.id, itemId)).limit(1);
  if (!live || live.deletedAt) return { error: t(lang).inventory.chooseItem };
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

/**
 * Deletes an inventory item. One that was never received or used goes completely. One with stock
 * history is only taken out of use, because finance reports are built from that history: it leaves
 * the list and every service, and any stock left is written off as a count correction.
 */
export async function deleteInventoryItem(_: ActionState, formData: FormData): Promise<ActionState> {
  const lang = langFrom(formData);
  const user = await requirePermission(lang, "inventory.manage");
  const id = str(formData, "id");
  if (!UUID_RE.test(id)) return { error: t(lang).common.errorGeneric };
  const db = await getDb();
  const [item] = await db.select().from(schema.inventoryItems).where(and(eq(schema.inventoryItems.id, id), isNull(schema.inventoryItems.deletedAt))).limit(1);
  if (!item) redirect(`/${lang}/inventory`);
  const [{ n }] = await db.select({ n: count() }).from(schema.inventoryMovements).where(eq(schema.inventoryMovements.itemId, id));

  if (n === 0) {
    await db.delete(schema.inventoryItems).where(eq(schema.inventoryItems.id, id));
    await audit("inventory.delete", { type: "inventory", label: item.nameEn }, { sku: item.sku });
  } else {
    const leftover = item.onHandMilli;
    if (leftover !== 0) {
      await moveStock(db, { itemId: id, deltaMilli: -leftover, reason: "adjustment", userId: user.id, note: t("en").inventory.deletedNote });
    }
    await db.delete(schema.serviceMaterials).where(eq(schema.serviceMaterials.itemId, id));
    await db.update(schema.inventoryItems).set({ active: false, deletedAt: new Date() }).where(eq(schema.inventoryItems.id, id));
    await audit("inventory.delete", { type: "inventory", id, label: item.nameEn }, { sku: item.sku, quantity: leftover ? [leftover / 1000, 0] : undefined });
  }
  redirect(`/${lang}/inventory`);
}

/** Brings a deleted item back into the list (with no stock; services need linking again). */
export async function restoreInventoryItem(_: ActionState, formData: FormData): Promise<ActionState> {
  const lang = langFrom(formData);
  await requirePermission(lang, "inventory.manage");
  const id = str(formData, "id");
  if (!UUID_RE.test(id)) return { error: t(lang).common.errorGeneric };
  const db = await getDb();
  const done = await db
    .update(schema.inventoryItems)
    .set({ active: true, deletedAt: null })
    .where(eq(schema.inventoryItems.id, id))
    .returning({ name: schema.inventoryItems.nameEn });
  if (done[0]) await audit("inventory.restore", { type: "inventory", id, label: done[0].name });
  refresh();
  return undefined;
}

const PAY_METHODS = ["cash", "knet", "card", "transfer"] as const;

/** A recorded purchase or count correction, if it may still be changed (its item isn't deleted). */
async function editableMovement(id: string) {
  if (!UUID_RE.test(id)) return null;
  const db = await getDb();
  const [row] = await db
    .select({ mv: schema.inventoryMovements, item: schema.inventoryItems })
    .from(schema.inventoryMovements)
    .innerJoin(schema.inventoryItems, eq(schema.inventoryItems.id, schema.inventoryMovements.itemId))
    .where(eq(schema.inventoryMovements.id, id))
    .limit(1);
  if (!row || (row.mv.reason !== "restock" && row.mv.reason !== "adjustment")) return null;
  return row;
}

const kuwaitIsoDate = (d: Date) => new Date(d.getTime() + 3 * 3600_000).toISOString().slice(0, 10);

/** Corrects a stock purchase (quantity, amount paid, supplier, payment method) or a count correction. */
export async function updateStockMovement(_: ActionState, formData: FormData): Promise<ActionState> {
  const lang = langFrom(formData);
  await requirePermission(lang, "inventory.manage");
  const I = t(lang).inventory;
  const row = await editableMovement(str(formData, "id"));
  if (!row) return { error: t(lang).common.errorGeneric };
  if (row.item.deletedAt) return { error: I.deletedLocked };
  const { mv, item } = row;
  const isPurchase = mv.reason === "restock";

  // Purchases take a positive quantity; a count correction is a signed change ("-2" means 2 went missing).
  const raw = str(formData, "quantity").replace(/^[−–]/, "-");
  const negative = raw.startsWith("-");
  const abs = qtyToMilli(raw.replace(/^-/, ""));
  const delta = abs === null ? null : negative ? -abs : abs;
  if (delta === null || delta === 0 || (isPurchase && delta < 0)) return { error: I.invalidQty };

  const costRaw = str(formData, "totalCost");
  const total = !isPurchase || costRaw === "" ? null : kwdToFils(costRaw);
  if (isPurchase && costRaw !== "" && total === null) return { error: I.invalidCost };
  const paidWith = PAY_METHODS.find((m) => m === str(formData, "paidWith")) ?? "cash";

  // A new date keeps the original time of day; never in the future.
  const date = str(formData, "date");
  let createdAt: Date | undefined;
  if (date && date !== kuwaitIsoDate(mv.createdAt)) {
    const time = new Date(mv.createdAt.getTime() + 3 * 3600_000).toISOString().slice(11, 19);
    const d = new Date(`${date}T${time}+03:00`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(d.getTime()) || date > todayKuwait()) return { error: I.invalidDate };
    createdAt = d;
  }

  const next = { deltaMilli: delta, totalCostFils: total, supplier: optStr(formData, "supplier"), paidWith, note: optStr(formData, "note"), createdAt };
  const db = await getDb();
  await reviseMovement(db, mv.id, next);

  const details = changes(
    { quantity: mv.deltaMilli / 1000, totalFils: mv.totalCostFils, supplier: mv.supplier, method: mv.paidWith, notes: mv.note, date: kuwaitIsoDate(mv.createdAt) },
    {
      quantity: delta / 1000,
      totalFils: total,
      supplier: isPurchase ? next.supplier : null,
      method: total != null ? paidWith : null,
      notes: next.note,
      date: createdAt ? kuwaitIsoDate(createdAt) : kuwaitIsoDate(mv.createdAt),
    },
    ["quantity", "totalFils", "supplier", "method", "notes", "date"],
  );
  await audit(isPurchase ? "inventory.editPurchase" : "inventory.editCount", { type: "inventory", id: item.id, label: item.nameEn }, details);
  redirect(`/${lang}/inventory/movements`);
}

/** Removes a recorded purchase or count correction; the stock goes back to what it was without it. */
export async function deleteStockMovement(_: ActionState, formData: FormData): Promise<ActionState> {
  const lang = langFrom(formData);
  await requirePermission(lang, "inventory.manage");
  const row = await editableMovement(str(formData, "id"));
  if (!row) return { error: t(lang).common.errorGeneric };
  if (row.item.deletedAt) return { error: t(lang).inventory.deletedLocked };
  const { mv, item } = row;
  const db = await getDb();
  await reviseMovement(db, mv.id, { deltaMilli: 0 });
  await audit(mv.reason === "restock" ? "inventory.deletePurchase" : "inventory.deleteCount", { type: "inventory", id: item.id, label: item.nameEn }, {
    quantity: mv.deltaMilli / 1000,
    totalFils: mv.totalCostFils,
    supplier: mv.supplier,
    date: kuwaitIsoDate(mv.createdAt),
  });
  redirect(`/${lang}/inventory/movements`);
}
