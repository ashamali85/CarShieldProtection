"use server";

import { and, eq, inArray, sql, sum } from "drizzle-orm";
import { redirect } from "next/navigation";
import { refresh } from "next/cache";
import { getDb, schema } from "@/db";
import { can, requirePermission, type CurrentUser } from "@/lib/auth";
import type { ActionState } from "@/components/forms";
import type { Db } from "@/db";
import type { Job, JobStatus } from "@/db/schema";
import { todayKuwait } from "@/lib/dates";
import { clampJobStock, consumeJobItems, jobMaterialUse, moveStock, restoreJobStock } from "@/lib/inventory";
import { jobDiscount, parsePercent, QC_CHECKS, qcComplete, subtotalOf, type DiscountInput } from "@/lib/pricing";
import { formatMoney } from "@/i18n";
import type { Locale } from "@/i18n";
import { kwdToFils, langFrom, optStr, qtyToMilli, str, t, UUID_RE } from "./helpers";

/** Reads the discount fields: an amount in KWD, or a percentage when discountType is "percent". */
function parseDiscount(formData: FormData): DiscountInput | null {
  const raw = str(formData, "discount");
  if (str(formData, "discountType") === "percent") {
    const bp = parsePercent(raw);
    return bp === null ? null : { discountFils: 0, discountPercentBp: bp };
  }
  const fils = kwdToFils(raw);
  return fils === null ? null : { discountFils: fils, discountPercentBp: null };
}

/** Only active users whose role can see jobs can be assigned to one. */
async function assignable(db: Db, userId: string | null): Promise<string | null> {
  if (!userId || !UUID_RE.test(userId)) return null;
  const [u] = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .innerJoin(schema.roles, eq(schema.roles.id, schema.users.roleId))
    .where(and(eq(schema.users.id, userId), eq(schema.users.active, true), sql`(${schema.roles.system} or 'jobs.view' = any(${schema.roles.permissions}))`))
    .limit(1);
  return u ? u.id : null;
}

async function loadJob(db: Db, jobId: string) {
  const [job] = await db.select().from(schema.jobs).where(eq(schema.jobs.id, jobId)).limit(1);
  const [invoice] = job ? await db.select().from(schema.invoices).where(eq(schema.invoices.jobId, jobId)).limit(1) : [];
  return { job, invoice };
}

/**
 * Services and the discount can change until the car is delivered. Once invoiced, only people
 * allowed to adjust invoices can change them (and never on a void invoice).
 */
function pricingEditable(user: CurrentUser, job: Job | undefined, invoice: { status: string } | undefined) {
  if (!job || job.status === "cancelled" || job.status === "delivered") return false;
  if (!invoice) return true;
  return invoice.status !== "void" && can(user, "invoices.adjust");
}

async function paidOn(db: Db, invoiceId: string): Promise<number> {
  const [row] = await db.select({ v: sum(schema.payments.amountFils) }).from(schema.payments).where(eq(schema.payments.invoiceId, invoiceId));
  return Number(row?.v ?? 0);
}

/** An error message if the new total would fall below what the customer has already paid. */
async function overpaidError(db: Db, lang: Locale, invoice: { id: string } | undefined, newTotal: number): Promise<string | null> {
  if (!invoice) return null;
  const paid = await paidOn(db, invoice.id);
  if (paid <= newTotal) return null;
  return t(lang).jobs.overpaid.replace("{paid}", formatMoney(paid, lang)).replace("{total}", formatMoney(newTotal, lang));
}

/** Recomputes an invoice from its job's current services and discount, and its paid status. */
async function syncInvoice(db: Db, jobId: string) {
  const { job, invoice } = await loadJob(db, jobId);
  if (!job || !invoice || invoice.status === "void") return;
  const items = await db.select().from(schema.jobItems).where(eq(schema.jobItems.jobId, jobId));
  const subtotal = subtotalOf(items);
  const discount = jobDiscount(job, subtotal);
  const total = subtotal - discount;
  const paid = await paidOn(db, invoice.id);
  await db
    .update(schema.invoices)
    .set({
      subtotalFils: subtotal,
      discountFils: discount,
      discountPercentBp: job.discountPercentBp,
      totalFils: total,
      status: paid >= total ? "paid" : paid > 0 ? "partial" : "unpaid",
    })
    .where(eq(schema.invoices.id, invoice.id));
}

/** Kuwait has no DST, so a fixed +03:00 offset is exact. */
function parseLocalDateTime(value: string): Date | null {
  if (!value) return null;
  const d = new Date(`${value}:00+03:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

export async function createJob(_: ActionState, formData: FormData): Promise<ActionState> {
  const lang = langFrom(formData);
  const user = await requirePermission(lang, "jobs.manage");
  const dict = t(lang);
  const customerId = str(formData, "customerId");
  const vehicleId = str(formData, "vehicleId");
  const serviceIds = formData.getAll("serviceId").map(String).filter((id) => UUID_RE.test(id));
  const discount = parseDiscount(formData);

  if (!UUID_RE.test(customerId) || !UUID_RE.test(vehicleId)) return { error: dict.jobs.chooseVehicle };
  if (serviceIds.length === 0) return { error: dict.jobs.chooseServices };
  if (discount === null) return { error: dict.jobs.discountInvalid };

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
      technicianId: await assignable(db, optStr(formData, "technicianId")),
      scheduledAt: parseLocalDateTime(str(formData, "scheduledAt")),
      ...discount,
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
  const user = await requirePermission(lang, "jobs.manage");
  const dict = t(lang);
  const id = str(formData, "id");
  if (!UUID_RE.test(id)) return { error: dict.common.errorGeneric };
  const db = await getDb();
  const { job, invoice } = await loadJob(db, id);
  if (!job) return { error: dict.common.errorGeneric };

  // The discount is only on the form when it may be changed.
  const changeDiscount = formData.has("discountType") && pricingEditable(user, job, invoice);
  const discount = changeDiscount ? parseDiscount(formData) : null;
  if (changeDiscount && !discount) return { error: dict.jobs.discountInvalid };
  if (discount && invoice) {
    const items = await db.select().from(schema.jobItems).where(eq(schema.jobItems.jobId, id));
    const subtotal = subtotalOf(items);
    const err = await overpaidError(db, lang, invoice, subtotal - jobDiscount(discount, subtotal));
    if (err) return { error: err };
  }

  await db
    .update(schema.jobs)
    .set({
      technicianId: await assignable(db, optStr(formData, "technicianId")),
      scheduledAt: parseLocalDateTime(str(formData, "scheduledAt")),
      notes: optStr(formData, "notes"),
      ...(discount ?? {}),
    })
    .where(eq(schema.jobs.id, id));
  if (discount && invoice) await syncInvoice(db, id);
  refresh();
  return {};
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
  const user = await requirePermission(lang, "jobs.manage");
  const id = str(formData, "id");
  const to = str(formData, "to") as JobStatus;
  if (!UUID_RE.test(id)) return;

  const db = await getDb();
  const [job] = await db.select().from(schema.jobs).where(eq(schema.jobs.id, id)).limit(1);
  if (!job || !NEXT[job.status].includes(to)) return;

  const [invoice] = await db.select().from(schema.invoices).where(eq(schema.invoices.jobId, id)).limit(1);
  if (to === "cancelled" && invoice) return;
  // Ready for pickup only once every quality check is ticked.
  if (to === "completed" && !qcComplete(job.qcChecks)) redirect(`/${lang}/jobs/${id}?blocked=checklist`);
  // Handing the car over needs the invoice issued and fully paid.
  if (to === "delivered") {
    if (!invoice || invoice.status === "void") redirect(`/${lang}/jobs/${id}?blocked=noInvoice`);
    if (invoice.status !== "paid") redirect(`/${lang}/jobs/${id}?blocked=unpaid`);
  }

  const now = new Date();
  const firstStart = to === "in_progress" && !job.startedAt;
  // The status guard makes a double-click (or two people) apply the change only once.
  const updated = await db
    .update(schema.jobs)
    .set({
      status: to,
      ...(firstStart ? { startedAt: now } : {}),
      ...(to === "completed" ? { completedAt: now } : {}),
      ...(to === "delivered" ? { deliveredAt: now } : {}),
      // Sent back for more work: the quality check starts again.
      ...(job.status === "quality_check" && to === "in_progress" ? { qcChecks: [], qcCheckedBy: null, qcCheckedAt: null } : {}),
    })
    .where(and(eq(schema.jobs.id, id), eq(schema.jobs.status, job.status)))
    .returning({ id: schema.jobs.id });
  if (updated.length === 0) return refresh();

  if (firstStart) {
    const items = await db.select().from(schema.jobItems).where(eq(schema.jobItems.jobId, id));
    await consumeJobItems(db, id, items, user.id);
  }
  if (to === "cancelled" && job.startedAt) {
    await restoreJobStock(db, id, user.id);
  }

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

export async function addJobItem(_: ActionState, formData: FormData): Promise<ActionState> {
  const lang = langFrom(formData);
  const user = await requirePermission(lang, "jobs.manage");
  const jobId = str(formData, "jobId");
  const serviceId = str(formData, "serviceId");
  if (!UUID_RE.test(jobId) || !UUID_RE.test(serviceId)) return { error: t(lang).jobs.chooseServices };
  const db = await getDb();
  const { job, invoice } = await loadJob(db, jobId);
  if (!pricingEditable(user, job, invoice)) return { error: t(lang).jobs.lockedInvoiced };
  const [s] = await db.select().from(schema.services).where(eq(schema.services.id, serviceId)).limit(1);
  if (!s) return { error: t(lang).jobs.chooseServices };
  const [item] = await db
    .insert(schema.jobItems)
    .values({ jobId, serviceId: s.id, nameEn: s.nameEn, nameAr: s.nameAr, priceFils: s.priceFils, warrantyMonths: s.warrantyMonths })
    .returning();
  // Work already started: take the new service's materials now.
  if (job!.startedAt) await consumeJobItems(db, jobId, [item], user.id);
  if (invoice) await syncInvoice(db, jobId);
  refresh();
  return {};
}

/** Removes a service. Problems come back as a notice on the job page (?blocked=…). */
export async function removeJobItem(formData: FormData) {
  const lang = langFrom(formData);
  const user = await requirePermission(lang, "jobs.manage");
  const jobId = str(formData, "jobId");
  const itemId = str(formData, "itemId");
  if (!UUID_RE.test(jobId) || !UUID_RE.test(itemId)) return;
  const db = await getDb();
  const { job, invoice } = await loadJob(db, jobId);
  if (!pricingEditable(user, job, invoice)) return;
  const items = await db.select().from(schema.jobItems).where(eq(schema.jobItems.jobId, jobId));
  const rest = items.filter((i) => i.id !== itemId);
  // A job keeps at least one service.
  if (rest.length === items.length || rest.length === 0) return;
  const subtotal = subtotalOf(rest);
  if (await overpaidError(db, lang, invoice, subtotal - jobDiscount(job!, subtotal))) redirect(`/${lang}/jobs/${jobId}?blocked=overpaid`);
  if (job!.startedAt) {
    await restoreJobStock(db, jobId, user.id, itemId);
    // Quantities adjusted by hand can't leave this job having "used" less than nothing.
    await clampJobStock(db, jobId, user.id);
  }
  await db.delete(schema.jobItems).where(and(eq(schema.jobItems.id, itemId), eq(schema.jobItems.jobId, jobId)));
  if (invoice) await syncInvoice(db, jobId);
  refresh();
}

/** Ticks or unticks the quality-check list while the job is in quality check. */
export async function saveQcChecklist(_: ActionState, formData: FormData): Promise<ActionState> {
  const lang = langFrom(formData);
  const user = await requirePermission(lang, "jobs.manage");
  const id = str(formData, "id");
  if (!UUID_RE.test(id)) return { error: t(lang).common.errorGeneric };
  const checks = QC_CHECKS.filter((c) => formData.getAll("check").includes(c));
  const db = await getDb();
  await db
    .update(schema.jobs)
    .set({ qcChecks: [...checks], qcCheckedBy: user.id, qcCheckedAt: new Date() })
    .where(and(eq(schema.jobs.id, id), eq(schema.jobs.status, "quality_check")));
  refresh();
  return {};
}

/**
 * Sets how much of a material the job actually used (while work is in progress). Extra use is
 * taken from stock at the current cost; anything handed back returns at what the job paid for it.
 */
export async function setJobMaterial(_: ActionState, formData: FormData): Promise<ActionState> {
  const lang = langFrom(formData);
  const user = await requirePermission(lang, "jobs.manage");
  const jobId = str(formData, "jobId");
  const itemId = str(formData, "itemId");
  const qty = qtyToMilli(str(formData, "quantity"));
  if (!UUID_RE.test(jobId) || !UUID_RE.test(itemId) || qty === null || qty < 0) return { error: t(lang).jobs.materialsEdit.invalid };
  const db = await getDb();
  const { job } = await loadJob(db, jobId);
  if (!job || job.status !== "in_progress") return { error: t(lang).common.errorGeneric };
  const [item] = await db.select({ id: schema.inventoryItems.id }).from(schema.inventoryItems).where(eq(schema.inventoryItems.id, itemId)).limit(1);
  if (!item) return { error: t(lang).jobs.materialsEdit.invalid };
  const use = await jobMaterialUse(db, jobId, itemId);
  const delta = use.usedMilli - qty; // positive: stock goes back
  if (delta !== 0) {
    await moveStock(db, {
      itemId,
      deltaMilli: delta,
      reason: delta < 0 ? "job" : "job_reversal",
      jobId,
      userId: user.id,
      // Returned stock goes back at what this job was charged for it.
      ...(delta > 0 ? { unitCostOverrideFils: use.unitCostFils ?? "uncosted" } : {}),
    });
  }
  refresh();
  return {};
}
