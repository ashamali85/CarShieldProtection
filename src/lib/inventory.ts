import "server-only";
import { and, eq, inArray, sql } from "drizzle-orm";
import { getDb, schema } from "@/db";
import type { Db } from "@/db";
import type { MovementReason, PaymentMethod } from "@/db/schema";

/** Records a stock change and updates the cached on-hand quantity. */
export async function moveStock(
  db: Db,
  m: {
    itemId: string;
    deltaMilli: number;
    reason: MovementReason;
    userId?: string | null;
    jobId?: string | null;
    jobItemId?: string | null;
    note?: string | null;
    /** Restocks: exactly what was paid for this delivery, in fils. Updates the item's average cost. */
    purchaseTotalFils?: number | null;
    /**
     * Value this movement at a given cost per unit instead of the current average (job reversals
     * put stock back at the cost it was taken out at). "uncosted" keeps it without a cost.
     */
    unitCostOverrideFils?: number | "uncosted" | null;
    supplier?: string | null;
    paidWith?: PaymentMethod | null;
  },
) {
  if (m.deltaMilli === 0) return;
  const [item] = await db
    .select({ avg: schema.inventoryItems.avgCostFils, cost: schema.inventoryItems.unitCostFils })
    .from(schema.inventoryItems)
    .where(eq(schema.inventoryItems.id, m.itemId))
    .limit(1);
  const isPurchase = m.reason === "restock" && m.purchaseTotalFils != null && m.deltaMilli > 0;
  // Cost per whole unit, unrounded: 12.345 KWD for 5,000 ml is 2.469 fils per ml.
  const purchaseUnit = isPurchase ? (m.purchaseTotalFils! * 1000) / m.deltaMilli : null;
  const current = item?.avg ?? item?.cost ?? null;
  const unitCost =
    purchaseUnit ?? (m.unitCostOverrideFils === "uncosted" ? null : (m.unitCostOverrideFils ?? current));

  await db.insert(schema.inventoryMovements).values({
    itemId: m.itemId,
    deltaMilli: m.deltaMilli,
    reason: m.reason,
    userId: m.userId ?? null,
    jobId: m.jobId ?? null,
    jobItemId: m.jobItemId ?? null,
    note: m.note ?? null,
    unitCostFils: unitCost,
    totalCostFils: isPurchase ? m.purchaseTotalFils! : null,
    supplier: m.supplier ?? null,
    paidWith: isPurchase ? (m.paidWith ?? "cash") : null,
  });

  const items = schema.inventoryItems;
  if (purchaseUnit !== null) {
    // One atomic statement, so two deliveries at once can't average against a stale quantity.
    // Weighted average: stock on hand (never below zero) at the old average plus this purchase.
    const avg = sql`case when ${items.onHandMilli} <= 0 or coalesce(${items.avgCostFils}, ${items.unitCostFils}) is null
      then ${purchaseUnit}::float8
      else (${items.onHandMilli}::float8 * coalesce(${items.avgCostFils}, ${items.unitCostFils}) + ${m.deltaMilli}::float8 * ${purchaseUnit}::float8)
           / (${items.onHandMilli} + ${m.deltaMilli}) end`;
    await db
      .update(items)
      .set({ onHandMilli: sql`${items.onHandMilli} + ${m.deltaMilli}`, avgCostFils: avg, unitCostFils: sql`round(${avg})::int` })
      .where(eq(items.id, m.itemId));
  } else {
    await db
      .update(items)
      .set({ onHandMilli: sql`${items.onHandMilli} + ${m.deltaMilli}` })
      .where(eq(items.id, m.itemId));
  }
}

/** Deducts the materials of the given job items, using each service's current material list. */
export async function consumeJobItems(
  db: Db,
  jobId: string,
  items: { id: string; serviceId: string | null; quantity: number }[],
  userId: string,
) {
  const serviceIds = [...new Set(items.map((i) => i.serviceId).filter((s): s is string => !!s))];
  if (serviceIds.length === 0) return;
  const materials = await db
    .select()
    .from(schema.serviceMaterials)
    .where(inArray(schema.serviceMaterials.serviceId, serviceIds));

  for (const item of items) {
    for (const m of materials.filter((x) => x.serviceId === item.serviceId)) {
      await moveStock(db, {
        itemId: m.itemId,
        deltaMilli: -m.quantityMilli * item.quantity,
        reason: "job",
        jobId,
        jobItemId: item.id,
        userId,
      });
    }
  }
}

/**
 * Puts back whatever a job (or one of its items) has consumed, based on the
 * recorded movements, so later changes to a service's materials don't matter.
 */
export async function restoreJobStock(db: Db, jobId: string, userId: string, jobItemId?: string) {
  const net = await db
    .select({
      itemId: schema.inventoryMovements.itemId,
      jobItemId: schema.inventoryMovements.jobItemId,
      total: sql<number>`sum(${schema.inventoryMovements.deltaMilli})::int`,
      /** Cost value of what was consumed, so a reversal puts it back at the same cost. */
      value: sql<number>`sum(${schema.inventoryMovements.deltaMilli}::bigint * ${schema.inventoryMovements.unitCostFils})::float8`,
      costed: sql<number>`count(${schema.inventoryMovements.unitCostFils})::int`,
    })
    .from(schema.inventoryMovements)
    .where(
      and(
        eq(schema.inventoryMovements.jobId, jobId),
        inArray(schema.inventoryMovements.reason, ["job", "job_reversal"]),
        jobItemId ? eq(schema.inventoryMovements.jobItemId, jobItemId) : undefined,
      ),
    )
    .groupBy(schema.inventoryMovements.itemId, schema.inventoryMovements.jobItemId);

  for (const row of net) {
    if (row.total !== 0) {
      await moveStock(db, {
        itemId: row.itemId,
        deltaMilli: -row.total,
        reason: "job_reversal",
        jobId,
        jobItemId: row.jobItemId,
        userId,
        // Same cost it was taken out at (unrounded); uncosted usage stays uncosted.
        unitCostOverrideFils: row.costed > 0 && row.value != null ? row.value / row.total : "uncosted",
      });
    }
  }
}

/** How much of one material a job has used so far, and the average cost it was charged at. */
export async function jobMaterialUse(db: Db, jobId: string, itemId: string): Promise<{ usedMilli: number; unitCostFils: number | null }> {
  const [row] = await db
    .select({
      total: sql<number>`coalesce(sum(${schema.inventoryMovements.deltaMilli}), 0)::int`,
      value: sql<number | null>`sum(${schema.inventoryMovements.deltaMilli}::bigint * ${schema.inventoryMovements.unitCostFils})::float8`,
      costed: sql<number>`count(${schema.inventoryMovements.unitCostFils})::int`,
    })
    .from(schema.inventoryMovements)
    .where(
      and(
        eq(schema.inventoryMovements.jobId, jobId),
        eq(schema.inventoryMovements.itemId, itemId),
        inArray(schema.inventoryMovements.reason, ["job", "job_reversal"]),
      ),
    );
  const used = -(row?.total ?? 0);
  return { usedMilli: used, unitCostFils: used > 0 && row.costed > 0 && row.value != null ? row.value / row.total : null };
}

/** Brings any material this job has "used" a negative amount of back to zero, at the job's own cost. */
export async function clampJobStock(db: Db, jobId: string, userId: string) {
  const rows = await db
    .select({
      itemId: schema.inventoryMovements.itemId,
      total: sql<number>`sum(${schema.inventoryMovements.deltaMilli})::int`,
      value: sql<number | null>`sum(${schema.inventoryMovements.deltaMilli}::bigint * ${schema.inventoryMovements.unitCostFils})::float8`,
      costed: sql<number>`count(${schema.inventoryMovements.unitCostFils})::int`,
    })
    .from(schema.inventoryMovements)
    .where(and(eq(schema.inventoryMovements.jobId, jobId), inArray(schema.inventoryMovements.reason, ["job", "job_reversal"])))
    .groupBy(schema.inventoryMovements.itemId);
  for (const r of rows) {
    if (r.total > 0) {
      // Cancels the surplus at the value it was booked at, so the job's material cost nets to zero.
      await moveStock(db, {
        itemId: r.itemId,
        deltaMilli: -r.total,
        reason: "job",
        jobId,
        userId,
        unitCostOverrideFils: r.costed > 0 && r.value != null ? r.value / r.total : "uncosted",
      });
    }
  }
}

/** Materials a job needs (planned) or used (once started), per inventory item. */
export async function jobMaterials(jobId: string, started: boolean) {
  const db = await getDb();
  if (started) {
    return db
      .select({
        itemId: schema.inventoryItems.id,
        nameEn: schema.inventoryItems.nameEn,
        nameAr: schema.inventoryItems.nameAr,
        unit: schema.inventoryItems.unit,
        onHandMilli: schema.inventoryItems.onHandMilli,
        quantityMilli: sql<number>`(-sum(${schema.inventoryMovements.deltaMilli}))::int`,
      })
      .from(schema.inventoryMovements)
      .innerJoin(schema.inventoryItems, eq(schema.inventoryMovements.itemId, schema.inventoryItems.id))
      .where(and(eq(schema.inventoryMovements.jobId, jobId), inArray(schema.inventoryMovements.reason, ["job", "job_reversal"])))
      .groupBy(schema.inventoryItems.id)
      .having(sql`sum(${schema.inventoryMovements.deltaMilli}) <> 0`)
      .orderBy(schema.inventoryItems.nameEn);
  }
  return db
    .select({
      itemId: schema.inventoryItems.id,
      nameEn: schema.inventoryItems.nameEn,
      nameAr: schema.inventoryItems.nameAr,
      unit: schema.inventoryItems.unit,
      onHandMilli: schema.inventoryItems.onHandMilli,
      quantityMilli: sql<number>`sum(${schema.serviceMaterials.quantityMilli} * ${schema.jobItems.quantity})::int`,
    })
    .from(schema.jobItems)
    .innerJoin(schema.serviceMaterials, eq(schema.serviceMaterials.serviceId, schema.jobItems.serviceId))
    .innerJoin(schema.inventoryItems, eq(schema.serviceMaterials.itemId, schema.inventoryItems.id))
    .where(eq(schema.jobItems.jobId, jobId))
    .groupBy(schema.inventoryItems.id)
    .orderBy(schema.inventoryItems.nameEn);
}

export type MovementRevision = {
  /** New quantity change in thousandths (positive for a purchase; either sign for a count correction). 0 removes it. */
  deltaMilli: number;
  /** Purchases: what was paid in fils, or null for stock received without a price. */
  totalCostFils?: number | null;
  supplier?: string | null;
  paidWith?: PaymentMethod | null;
  note?: string | null;
  createdAt?: Date;
};

/**
 * Corrects a recorded purchase or count correction (or removes it when deltaMilli is 0). The item's
 * stock moves by the difference, and its average cost takes the difference in value, so the stock
 * still on the shelf carries the corrected price. Costs already charged to past jobs stay as they were.
 */
export async function reviseMovement(db: Db, movementId: string, next: MovementRevision): Promise<boolean> {
  const [mv] = await db.select().from(schema.inventoryMovements).where(eq(schema.inventoryMovements.id, movementId)).limit(1);
  if (!mv || (mv.reason !== "restock" && mv.reason !== "adjustment")) return false;
  const [item] = await db.select().from(schema.inventoryItems).where(eq(schema.inventoryItems.id, mv.itemId)).limit(1);
  if (!item) return false;
  const current = item.avgCostFils ?? item.unitCostFils ?? null;

  const priced = mv.reason === "restock" && next.totalCostFils != null && next.deltaMilli > 0;
  // Cost per whole unit of the corrected movement: the price paid, else what it was valued at before.
  const newUnit = priced ? (next.totalCostFils! * 1000) / next.deltaMilli : (mv.unitCostFils ?? current);
  const oldValue = (mv.deltaMilli * (mv.unitCostFils ?? current ?? 0)) / 1000;
  const newValue = (next.deltaMilli * (newUnit ?? 0)) / 1000;
  const dQty = next.deltaMilli - mv.deltaMilli;
  const dValue = newValue - oldValue;

  if (next.deltaMilli === 0) {
    await db.delete(schema.inventoryMovements).where(eq(schema.inventoryMovements.id, movementId));
  } else {
    await db
      .update(schema.inventoryMovements)
      .set({
        deltaMilli: next.deltaMilli,
        unitCostFils: newUnit,
        totalCostFils: priced ? next.totalCostFils! : null,
        paidWith: priced ? (next.paidWith ?? "cash") : null,
        supplier: mv.reason === "restock" ? (next.supplier ?? null) : null,
        note: next.note ?? null,
        ...(next.createdAt ? { createdAt: next.createdAt } : {}),
      })
      .where(eq(schema.inventoryMovements.id, movementId));
  }

  const items = schema.inventoryItems;
  const onHand = item.onHandMilli + dQty;
  let avg: number | null = current;
  if (current == null || item.onHandMilli <= 0) avg = priced ? newUnit : current;
  else if (onHand > 0) avg = Math.max(0, (item.onHandMilli * current + 1000 * dValue) / onHand);
  // Nothing left on the shelf: the average stays as it was.
  await db
    .update(items)
    .set({ onHandMilli: sql`${items.onHandMilli} + ${dQty}`, avgCostFils: avg, unitCostFils: avg == null ? item.unitCostFils : Math.round(avg) })
    .where(eq(items.id, mv.itemId));
  return true;
}
