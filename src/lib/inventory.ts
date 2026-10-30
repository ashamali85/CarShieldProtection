import "server-only";
import { and, eq, inArray, sql } from "drizzle-orm";
import { getDb, schema } from "@/db";
import type { Db } from "@/db";
import type { MovementReason } from "@/db/schema";

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
  },
) {
  if (m.deltaMilli === 0) return;
  await db.insert(schema.inventoryMovements).values({
    itemId: m.itemId,
    deltaMilli: m.deltaMilli,
    reason: m.reason,
    userId: m.userId ?? null,
    jobId: m.jobId ?? null,
    jobItemId: m.jobItemId ?? null,
    note: m.note ?? null,
  });
  await db
    .update(schema.inventoryItems)
    .set({ onHandMilli: sql`${schema.inventoryItems.onHandMilli} + ${m.deltaMilli}` })
    .where(eq(schema.inventoryItems.id, m.itemId));
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
