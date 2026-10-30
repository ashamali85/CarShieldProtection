"use server";

import { eq, sum } from "drizzle-orm";
import { redirect } from "next/navigation";
import { refresh } from "next/cache";
import { getDb, schema } from "@/db";
import { requireUser } from "@/lib/auth";
import type { ActionState } from "@/components/forms";
import type { PaymentMethod } from "@/db/schema";
import { kwdToFils, langFrom, optStr, str, t, UUID_RE } from "./helpers";

export async function createInvoice(formData: FormData) {
  const lang = langFrom(formData);
  await requireUser(lang);
  const jobId = str(formData, "jobId");
  if (!UUID_RE.test(jobId)) return;

  const db = await getDb();
  const [job] = await db.select().from(schema.jobs).where(eq(schema.jobs.id, jobId)).limit(1);
  if (!job || job.status === "cancelled") return;

  const [existing] = await db.select({ id: schema.invoices.id }).from(schema.invoices).where(eq(schema.invoices.jobId, jobId)).limit(1);
  if (existing) redirect(`/${lang}/invoices/${existing.id}`);

  const items = await db.select().from(schema.jobItems).where(eq(schema.jobItems.jobId, jobId));
  if (items.length === 0) return;

  const subtotal = items.reduce((acc, i) => acc + i.priceFils * i.quantity, 0);
  const discount = Math.min(job.discountFils, subtotal);
  const [invoice] = await db
    .insert(schema.invoices)
    .values({
      jobId,
      subtotalFils: subtotal,
      discountFils: discount,
      totalFils: subtotal - discount,
      status: subtotal - discount === 0 ? "paid" : "unpaid",
    })
    .onConflictDoNothing()
    .returning({ id: schema.invoices.id });

  if (!invoice) {
    // Another request created it at the same moment.
    const [row] = await db.select({ id: schema.invoices.id }).from(schema.invoices).where(eq(schema.invoices.jobId, jobId)).limit(1);
    redirect(`/${lang}/invoices/${row.id}`);
  }
  redirect(`/${lang}/invoices/${invoice.id}`);
}

const METHODS: PaymentMethod[] = ["cash", "knet", "card", "transfer"];

export async function recordPayment(_: ActionState, formData: FormData): Promise<ActionState> {
  const lang = langFrom(formData);
  const user = await requireUser(lang);
  const dict = t(lang);
  const invoiceId = str(formData, "invoiceId");
  const method = str(formData, "method") as PaymentMethod;
  const amount = kwdToFils(str(formData, "amount"));
  if (!UUID_RE.test(invoiceId) || !METHODS.includes(method) || !amount || amount <= 0) {
    return { error: dict.common.required };
  }

  const db = await getDb();
  const [invoice] = await db.select().from(schema.invoices).where(eq(schema.invoices.id, invoiceId)).limit(1);
  if (!invoice || invoice.status === "void") return { error: dict.common.errorGeneric };

  const [paidRow] = await db
    .select({ paid: sum(schema.payments.amountFils) })
    .from(schema.payments)
    .where(eq(schema.payments.invoiceId, invoiceId));
  const paid = Number(paidRow?.paid ?? 0);
  if (paid + amount > invoice.totalFils) return { error: dict.invoices.overpay };

  await db.insert(schema.payments).values({
    invoiceId,
    amountFils: amount,
    method,
    reference: optStr(formData, "reference"),
    receivedBy: user.id,
  });
  const newPaid = paid + amount;
  await db
    .update(schema.invoices)
    .set({ status: newPaid >= invoice.totalFils ? "paid" : "partial" })
    .where(eq(schema.invoices.id, invoiceId));

  refresh();
  return undefined;
}
