"use server";

import { and, eq, inArray } from "drizzle-orm";
import { redirect } from "next/navigation";
import { refresh } from "next/cache";
import { getDb, schema } from "@/db";
import { requireUser } from "@/lib/auth";
import type { ActionState } from "@/components/forms";
import type { JobStatus } from "@/db/schema";
import { todayKuwait } from "@/lib/dates";
import { kwdToFils, langFrom, optStr, str, t, UUID_RE } from "./helpers";

/** Kuwait has no DST, so a fixed +03:00 offset is exact. */
function parseLocalDateTime(value: string): Date | null {
  if (!value) return null;
  const d = new Date(`${value}:00+03:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

export async function createJob(_: ActionState, formData: FormData): Promise<ActionState> {
  const lang = langFrom(formData);
  const user = await requireUser(lang);
  const dict = t(lang);
  const customerId = str(formData, "customerId");
  const vehicleId = str(formData, "vehicleId");
  const serviceIds = formData.getAll("serviceId").map(String).filter((id) => UUID_RE.test(id));
  const technicianId = optStr(formData, "technicianId");
  const discountFils = kwdToFils(str(formData, "discount"));

  if (!UUID_RE.test(customerId) || !UUID_RE.test(vehicleId)) return { error: dict.jobs.chooseVehicle };
  if (serviceIds.length === 0) return { error: dict.jobs.chooseServices };
  if (discountFils === null) return { error: dict.common.required };

  const db = await getDb();
  const [vehicle] = await db
    .select({ id: schema.vehicles.id })
    .from(schema.vehicles)
    .where(and(eq(schema.vehicles.id, vehicleId), eq(schema.vehicles.customerId, customerId)))
    .limit(1);
  if (!vehicle) return { error: dict.jobs.chooseVehicle };

  const chosen = await db.select().from(schema.services).where(inArray(schema.services.id, serviceIds));
  if (chosen.length === 0) return { error: dict.jobs.chooseServices };

  const [job] = await db
    .insert(schema.jobs)
    .values({
      customerId,
      vehicleId,
      technicianId: technicianId && UUID_RE.test(technicianId) ? technicianId : null,
      scheduledAt: parseLocalDateTime(str(formData, "scheduledAt")),
      discountFils,
      notes: optStr(formData, "notes"),
      createdBy: user.id,
    })
    .returning({ id: schema.jobs.id });

  await db.insert(schema.jobItems).values(
    chosen.map((s) => ({
      jobId: job.id,
      serviceId: s.id,
      nameEn: s.nameEn,
      nameAr: s.nameAr,
      priceFils: s.priceFils,
      warrantyMonths: s.warrantyMonths,
    })),
  );

  redirect(`/${lang}/jobs/${job.id}`);
}

export async function updateJobDetails(_: ActionState, formData: FormData): Promise<ActionState> {
  const lang = langFrom(formData);
  await requireUser(lang);
  const dict = t(lang);
  const id = str(formData, "id");
  const technicianId = optStr(formData, "technicianId");
  const discountFils = kwdToFils(str(formData, "discount"));
  if (!UUID_RE.test(id) || discountFils === null) return { error: dict.common.errorGeneric };

  const db = await getDb();
  const [invoice] = await db.select({ id: schema.invoices.id }).from(schema.invoices).where(eq(schema.invoices.jobId, id)).limit(1);
  await db
    .update(schema.jobs)
    .set({
      technicianId: technicianId && UUID_RE.test(technicianId) ? technicianId : null,
      scheduledAt: parseLocalDateTime(str(formData, "scheduledAt")),
      notes: optStr(formData, "notes"),
      // Pricing is locked once the invoice exists.
      ...(invoice ? {} : { discountFils }),
    })
    .where(eq(schema.jobs.id, id));
  refresh();
  return undefined;
}

const NEXT: Record<JobStatus, JobStatus[]> = {
  scheduled: ["in_progress", "cancelled"],
  in_progress: ["quality_check", "cancelled"],
  quality_check: ["in_progress", "completed"],
  completed: ["delivered"],
  delivered: [],
  cancelled: [],
};

function addMonths(isoDate: string, months: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + months);
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, last));
  return d.toISOString().slice(0, 10);
}

export async function setJobStatus(formData: FormData) {
  const lang = langFrom(formData);
  await requireUser(lang);
  const id = str(formData, "id");
  const to = str(formData, "to") as JobStatus;
  if (!UUID_RE.test(id)) return;

  const db = await getDb();
  const [job] = await db.select().from(schema.jobs).where(eq(schema.jobs.id, id)).limit(1);
  if (!job || !NEXT[job.status].includes(to)) return;

  if (to === "cancelled") {
    const [invoice] = await db.select({ id: schema.invoices.id }).from(schema.invoices).where(eq(schema.invoices.jobId, id)).limit(1);
    if (invoice) return;
  }

  const now = new Date();
  await db
    .update(schema.jobs)
    .set({
      status: to,
      ...(to === "in_progress" && !job.startedAt ? { startedAt: now } : {}),
      ...(to === "completed" ? { completedAt: now } : {}),
      ...(to === "delivered" ? { deliveredAt: now } : {}),
    })
    .where(eq(schema.jobs.id, id));

  if (to === "delivered") {
    const items = await db.select().from(schema.jobItems).where(eq(schema.jobItems.jobId, id));
    const today = todayKuwait();
    const covered = items.filter((i) => i.warrantyMonths > 0);
    if (covered.length > 0) {
      await db
        .insert(schema.warranties)
        .values(
          covered.map((item, idx) => ({
            code: `CSP-${today.slice(0, 4)}-${String(job.number).padStart(5, "0")}-${idx + 1}`,
            jobId: id,
            jobItemId: item.id,
            customerId: job.customerId,
            vehicleId: job.vehicleId,
            nameEn: item.nameEn,
            nameAr: item.nameAr,
            startsOn: today,
            endsOn: addMonths(today, item.warrantyMonths),
          })),
        )
        .onConflictDoNothing();
    }
  }
  refresh();
}

async function jobIsEditable(jobId: string) {
  const db = await getDb();
  const [job] = await db.select({ status: schema.jobs.status }).from(schema.jobs).where(eq(schema.jobs.id, jobId)).limit(1);
  const [invoice] = await db.select({ id: schema.invoices.id }).from(schema.invoices).where(eq(schema.invoices.jobId, jobId)).limit(1);
  return !!job && !invoice && job.status !== "cancelled" && job.status !== "delivered";
}

export async function addJobItem(formData: FormData) {
  const lang = langFrom(formData);
  await requireUser(lang);
  const jobId = str(formData, "jobId");
  const serviceId = str(formData, "serviceId");
  if (!UUID_RE.test(jobId) || !UUID_RE.test(serviceId) || !(await jobIsEditable(jobId))) return;
  const db = await getDb();
  const [s] = await db.select().from(schema.services).where(eq(schema.services.id, serviceId)).limit(1);
  if (!s) return;
  await db.insert(schema.jobItems).values({
    jobId,
    serviceId: s.id,
    nameEn: s.nameEn,
    nameAr: s.nameAr,
    priceFils: s.priceFils,
    warrantyMonths: s.warrantyMonths,
  });
  refresh();
}

export async function removeJobItem(formData: FormData) {
  const lang = langFrom(formData);
  await requireUser(lang);
  const jobId = str(formData, "jobId");
  const itemId = str(formData, "itemId");
  if (!UUID_RE.test(jobId) || !UUID_RE.test(itemId) || !(await jobIsEditable(jobId))) return;
  const db = await getDb();
  await db.delete(schema.jobItems).where(and(eq(schema.jobItems.id, itemId), eq(schema.jobItems.jobId, jobId)));
  refresh();
}
