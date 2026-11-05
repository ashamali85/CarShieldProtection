"use server";

import { and, asc, count, eq, isNull, ne } from "drizzle-orm";
import { redirect } from "next/navigation";
import { refresh } from "next/cache";
import { getDb, schema } from "@/db";
import type { CashEntryKind, PaymentMethod } from "@/db/schema";
import { requirePermission } from "@/lib/auth";
import type { ActionState } from "@/components/forms";
import { addDaysIso } from "@/lib/hr";
import { kwdToFils, langFrom, optStr, str, t, UUID_RE } from "./helpers";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
/** A real calendar date between 2000 and 2100 (rejects 2026-02-31). */
const DATE = {
  test: (v: string) => {
    if (!DATE_RE.test(v) || v < "2000-01-01" || v > "2100-12-31") return false;
    const d = new Date(`${v}T00:00:00Z`);
    return !Number.isNaN(d.getTime()) && d.toISOString().startsWith(v);
  },
};
const METHODS: PaymentMethod[] = ["cash", "knet", "card", "transfer"];
const KINDS: CashEntryKind[] = ["capital_in", "owner_drawing", "loan_received", "loan_repayment", "other_income", "deposit_paid", "deposit_refund"];
const method = (fd: FormData) => METHODS.find((m) => m === str(fd, "method")) ?? null;
const positive = (fd: FormData, k: string) => {
  const v = kwdToFils(str(fd, k));
  return v && v > 0 ? v : null;
};
/** Only return to finance pages we know. */
const back = (fd: FormData, lang: string, fallback: string) => {
  const b = str(fd, "back");
  return b.startsWith(`/${lang}/finance/`) ? b : fallback;
};

export async function saveExpense(_: ActionState, fd: FormData): Promise<ActionState> {
  const lang = langFrom(fd);
  const user = await requirePermission(lang, "finance.manage");
  const id = str(fd, "id");
  const date = str(fd, "date");
  const categoryId = str(fd, "categoryId");
  const description = str(fd, "description");
  const amount = positive(fd, "amount");
  const m = method(fd);
  const X = t(lang).finance.expenses;
  if (!DATE.test(date) || !UUID_RE.test(categoryId) || !description || !amount || !m) return { error: X.invalid };
  const db = await getDb();
  const [cat] = await db.select({ kind: schema.expenseCategories.kind }).from(schema.expenseCategories).where(eq(schema.expenseCategories.id, categoryId)).limit(1);
  if (!cat) return { error: X.invalid };
  const existing = UUID_RE.test(id)
    ? (await db.select({ contractId: schema.expenses.contractId }).from(schema.expenses).where(eq(schema.expenses.id, id)).limit(1))[0]
    : undefined;
  // Optional period the payment covers. Not used for assets or contract payments.
  let periodFrom: string | null = null;
  let periodTo: string | null = null;
  if (fd.get("hasPeriod") === "on" && cat.kind === "operating" && !existing?.contractId) {
    periodFrom = str(fd, "periodFrom");
    periodTo = str(fd, "periodTo");
    if (!DATE.test(periodFrom) || !DATE.test(periodTo) || periodTo < periodFrom || periodTo > addDaysIso(periodFrom, 5 * 366)) return { error: X.periodInvalid };
  }
  const values = { date, categoryId, description, amountFils: amount, method: m, vendor: optStr(fd, "vendor"), reference: optStr(fd, "reference"), periodFrom, periodTo };
  if (existing) {
    if (existing.contractId) {
      // A contract payment keeps the contract's category.
      const [c] = await db.select({ categoryId: schema.recurringCosts.categoryId }).from(schema.recurringCosts).where(eq(schema.recurringCosts.id, existing.contractId)).limit(1);
      if (c) values.categoryId = c.categoryId;
    }
    await db.update(schema.expenses).set(values).where(eq(schema.expenses.id, id));
    redirect(back(fd, lang, `/${lang}/finance/expenses`));
  }
  await db.insert(schema.expenses).values({ ...values, createdById: user.id });
  refresh();
  return undefined;
}

export async function deleteExpense(_: ActionState, fd: FormData): Promise<ActionState> {
  const lang = langFrom(fd);
  await requirePermission(lang, "finance.manage");
  const id = str(fd, "id");
  if (!UUID_RE.test(id)) return undefined;
  const db = await getDb();
  await db.delete(schema.expenses).where(eq(schema.expenses.id, id));
  refresh();
  return undefined;
}

export async function saveCashEntry(_: ActionState, fd: FormData): Promise<ActionState> {
  const lang = langFrom(fd);
  const user = await requirePermission(lang, "finance.manage");
  const date = str(fd, "date");
  const kind = KINDS.find((k) => k === str(fd, "kind"));
  const amount = positive(fd, "amount");
  const m = method(fd);
  if (!DATE.test(date) || !kind || !amount || !m) return { error: t(lang).finance.money.invalid };
  const db = await getDb();
  await db.insert(schema.cashEntries).values({ date, kind, amountFils: amount, method: m, description: optStr(fd, "description"), createdById: user.id });
  refresh();
  return undefined;
}

export async function deleteCashEntry(_: ActionState, fd: FormData): Promise<ActionState> {
  const lang = langFrom(fd);
  await requirePermission(lang, "finance.manage");
  const id = str(fd, "id");
  if (!UUID_RE.test(id)) return undefined;
  const db = await getDb();
  await db.delete(schema.cashEntries).where(eq(schema.cashEntries.id, id));
  refresh();
  return undefined;
}

export async function saveFinanceSettings(_: ActionState, fd: FormData): Promise<ActionState> {
  const lang = langFrom(fd);
  await requirePermission(lang, "finance.manage");
  const raw = str(fd, "openingCash").replace(/^-/, "");
  const amount = kwdToFils(raw);
  const negative = str(fd, "openingCash").startsWith("-");
  const date = str(fd, "openingDate");
  if (amount === null || !DATE.test(date)) return { error: t(lang).finance.settings.invalid };
  const db = await getDb();
  const values = { id: 1, openingCashFils: negative ? -amount : amount, openingDate: date };
  await db.insert(schema.financeSettings).values(values).onConflictDoUpdate({ target: schema.financeSettings.id, set: { ...values, updatedAt: new Date() } });
  refresh();
  return undefined;
}

export async function saveExpenseCategory(_: ActionState, fd: FormData): Promise<ActionState> {
  const lang = langFrom(fd);
  await requirePermission(lang, "finance.manage");
  const S = t(lang).finance.settings;
  const id = str(fd, "id");
  const nameEn = str(fd, "nameEn");
  const nameAr = str(fd, "nameAr");
  const kind = str(fd, "kind") === "asset" ? ("asset" as const) : ("operating" as const);
  if (!nameEn || !nameAr) return { error: S.invalid };
  const db = await getDb();
  const [clash] = await db
    .select({ id: schema.expenseCategories.id })
    .from(schema.expenseCategories)
    .where(and(eq(schema.expenseCategories.nameEn, nameEn), UUID_RE.test(id) ? ne(schema.expenseCategories.id, id) : undefined))
    .limit(1);
  if (clash) return { error: S.exists };
  if (UUID_RE.test(id) && kind === "asset") {
    // Recurring costs must stay operating expenses.
    const [used] = await db.select({ id: schema.recurringCosts.id }).from(schema.recurringCosts).where(eq(schema.recurringCosts.categoryId, id)).limit(1);
    if (used) return { error: S.usedByContract };
  }
  if (UUID_RE.test(id)) {
    await db.update(schema.expenseCategories).set({ nameEn, nameAr, kind, active: fd.get("active") === "on" }).where(eq(schema.expenseCategories.id, id));
  } else {
    const code = `${nameEn.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 30) || "cat"}_${Date.now().toString(36)}`;
    await db.insert(schema.expenseCategories).values({ code, nameEn, nameAr, kind, sortOrder: 50 });
  }
  refresh();
  return undefined;
}

/* ---------------------------------------------------------------- Recurring costs (contracts) */

const dueDayOf = (fd: FormData) => {
  const n = Number(str(fd, "dueDay"));
  return Number.isInteger(n) && n >= 1 && n <= 28 ? n : null;
};

export async function saveContract(_: ActionState, fd: FormData): Promise<ActionState> {
  const lang = langFrom(fd);
  await requirePermission(lang, "finance.manage");
  const C = t(lang).finance.contracts;
  const id = str(fd, "id");
  const isEdit = UUID_RE.test(id);
  const name = str(fd, "name");
  const categoryId = str(fd, "categoryId");
  const startDate = str(fd, "startDate");
  const endDate = optStr(fd, "endDate");
  const dueDay = dueDayOf(fd);
  const monthly = isEdit ? 1 : positive(fd, "monthly");
  if (!name || !UUID_RE.test(categoryId) || !DATE.test(startDate) || (endDate && (!DATE.test(endDate) || endDate < startDate)) || !dueDay || !monthly) return { error: C.invalid };
  const db = await getDb();
  const [cat] = await db.select({ kind: schema.expenseCategories.kind }).from(schema.expenseCategories).where(eq(schema.expenseCategories.id, categoryId)).limit(1);
  if (!cat || cat.kind !== "operating") return { error: C.invalid };
  const values = { name, categoryId, vendor: optStr(fd, "vendor"), startDate, endDate, dueDay, notes: optStr(fd, "notes") };
  if (isEdit) {
    const rates = await db
      .select({ id: schema.recurringCostRates.id, from: schema.recurringCostRates.effectiveFrom })
      .from(schema.recurringCostRates)
      .where(eq(schema.recurringCostRates.contractId, id))
      .orderBy(asc(schema.recurringCostRates.effectiveFrom));
    // The new start can't pass an amount change, and the first amount always starts with the contract.
    if (rates.slice(1).some((r) => r.from <= startDate)) return { error: C.startAfterChange };
    if (endDate && rates.slice(1).some((r) => r.from > endDate)) return { error: C.endBeforeChange };
    await db.update(schema.recurringCosts).set(values).where(eq(schema.recurringCosts.id, id));
    if (rates[0] && rates[0].from !== startDate) await db.update(schema.recurringCostRates).set({ effectiveFrom: startDate }).where(eq(schema.recurringCostRates.id, rates[0].id));
    // Payments follow the contract's category.
    await db.update(schema.expenses).set({ categoryId }).where(eq(schema.expenses.contractId, id));
    refresh();
    return undefined;
  }
  const [row] = await db.insert(schema.recurringCosts).values(values).returning({ id: schema.recurringCosts.id });
  await db.insert(schema.recurringCostRates).values({ contractId: row.id, effectiveFrom: startDate, monthlyFils: monthly });
  redirect(`/${lang}/finance/contracts/${row.id}`);
}

export async function deleteContract(_: ActionState, fd: FormData): Promise<ActionState> {
  const lang = langFrom(fd);
  await requirePermission(lang, "finance.manage");
  const id = str(fd, "id");
  if (!UUID_RE.test(id)) return undefined;
  const db = await getDb();
  const [{ n }] = await db.select({ n: count() }).from(schema.expenses).where(eq(schema.expenses.contractId, id));
  if (n > 0) return { error: t(lang).finance.contracts.cannotDelete };
  await db.delete(schema.recurringCosts).where(eq(schema.recurringCosts.id, id));
  redirect(`/${lang}/finance/contracts`);
}

export async function addContractRate(_: ActionState, fd: FormData): Promise<ActionState> {
  const lang = langFrom(fd);
  await requirePermission(lang, "finance.manage");
  const C = t(lang).finance.contracts;
  const contractId = str(fd, "contractId");
  const effectiveFrom = str(fd, "effectiveFrom");
  const monthly = positive(fd, "monthly");
  if (!UUID_RE.test(contractId) || !DATE.test(effectiveFrom) || !monthly) return { error: C.rateInvalid };
  const db = await getDb();
  const [c] = await db.select({ start: schema.recurringCosts.startDate, end: schema.recurringCosts.endDate }).from(schema.recurringCosts).where(eq(schema.recurringCosts.id, contractId)).limit(1);
  if (!c || effectiveFrom <= c.start || (c.end && effectiveFrom > c.end)) return { error: C.rateInvalid };
  const [clash] = await db
    .select({ id: schema.recurringCostRates.id })
    .from(schema.recurringCostRates)
    .where(and(eq(schema.recurringCostRates.contractId, contractId), eq(schema.recurringCostRates.effectiveFrom, effectiveFrom)))
    .limit(1);
  if (clash) return { error: C.rateExists };
  await db.insert(schema.recurringCostRates).values({ contractId, effectiveFrom, monthlyFils: monthly });
  refresh();
  return undefined;
}

export async function deleteContractRate(_: ActionState, fd: FormData): Promise<ActionState> {
  const lang = langFrom(fd);
  await requirePermission(lang, "finance.manage");
  const id = str(fd, "id");
  const contractId = str(fd, "contractId");
  if (!UUID_RE.test(id) || !UUID_RE.test(contractId)) return undefined;
  const db = await getDb();
  // The first amount can't be removed: the contract always needs one.
  const rates = await db
    .select({ id: schema.recurringCostRates.id })
    .from(schema.recurringCostRates)
    .where(eq(schema.recurringCostRates.contractId, contractId))
    .orderBy(asc(schema.recurringCostRates.effectiveFrom));
  if (rates.length < 2 || rates[0].id === id) return undefined;
  await db.delete(schema.recurringCostRates).where(and(eq(schema.recurringCostRates.id, id), eq(schema.recurringCostRates.contractId, contractId)));
  refresh();
  return undefined;
}

export async function recordContractPayment(_: ActionState, fd: FormData): Promise<ActionState> {
  const lang = langFrom(fd);
  const user = await requirePermission(lang, "finance.manage");
  const T = t(lang).finance;
  const contractId = str(fd, "contractId");
  const date = str(fd, "date");
  const amount = positive(fd, "amount");
  const m = method(fd);
  if (!UUID_RE.test(contractId) || !DATE.test(date) || !amount || !m) return { error: T.contracts.paymentInvalid };
  const db = await getDb();
  const [c] = await db.select().from(schema.recurringCosts).where(eq(schema.recurringCosts.id, contractId)).limit(1);
  if (!c) return { error: T.contracts.paymentInvalid };
  await db.insert(schema.expenses).values({
    date,
    categoryId: c.categoryId,
    description: optStr(fd, "description") ?? T.expenses.contractPayment.replace("{name}", c.name),
    amountFils: amount,
    method: m,
    vendor: c.vendor,
    reference: optStr(fd, "reference"),
    contractId,
    createdById: user.id,
  });
  refresh();
  return undefined;
}

/** Turns an ordinary expense (recorded before the contract existed) into a payment against it. */
export async function linkExpenseToContract(_: ActionState, fd: FormData): Promise<ActionState> {
  const lang = langFrom(fd);
  await requirePermission(lang, "finance.manage");
  const contractId = str(fd, "contractId");
  const id = str(fd, "id");
  if (!UUID_RE.test(contractId) || !UUID_RE.test(id)) return undefined;
  const db = await getDb();
  const [c] = await db.select({ categoryId: schema.recurringCosts.categoryId }).from(schema.recurringCosts).where(eq(schema.recurringCosts.id, contractId)).limit(1);
  if (!c) return undefined;
  await db
    .update(schema.expenses)
    .set({ contractId, categoryId: c.categoryId, periodFrom: null, periodTo: null })
    .where(and(eq(schema.expenses.id, id), isNull(schema.expenses.contractId)));
  refresh();
  return undefined;
}
