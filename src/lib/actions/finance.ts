"use server";

import { and, eq, ne } from "drizzle-orm";
import { redirect } from "next/navigation";
import { refresh } from "next/cache";
import { getDb, schema } from "@/db";
import type { CashEntryKind, PaymentMethod } from "@/db/schema";
import { requireAdmin } from "@/lib/auth";
import type { ActionState } from "@/components/forms";
import { kwdToFils, langFrom, optStr, str, t, UUID_RE } from "./helpers";

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const METHODS: PaymentMethod[] = ["cash", "knet", "card", "transfer"];
const KINDS: CashEntryKind[] = ["capital_in", "owner_drawing", "loan_received", "loan_repayment", "other_income"];
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
  const user = await requireAdmin(lang);
  const id = str(fd, "id");
  const date = str(fd, "date");
  const categoryId = str(fd, "categoryId");
  const description = str(fd, "description");
  const amount = positive(fd, "amount");
  const m = method(fd);
  if (!DATE.test(date) || !UUID_RE.test(categoryId) || !description || !amount || !m) return { error: t(lang).finance.expenses.invalid };
  const values = { date, categoryId, description, amountFils: amount, method: m, vendor: optStr(fd, "vendor"), reference: optStr(fd, "reference") };
  const db = await getDb();
  if (UUID_RE.test(id)) {
    await db.update(schema.expenses).set(values).where(eq(schema.expenses.id, id));
    redirect(back(fd, lang, `/${lang}/finance/expenses`));
  }
  await db.insert(schema.expenses).values({ ...values, createdById: user.id });
  refresh();
  return undefined;
}

export async function deleteExpense(_: ActionState, fd: FormData): Promise<ActionState> {
  const lang = langFrom(fd);
  await requireAdmin(lang);
  const id = str(fd, "id");
  if (!UUID_RE.test(id)) return undefined;
  const db = await getDb();
  await db.delete(schema.expenses).where(eq(schema.expenses.id, id));
  refresh();
  return undefined;
}

export async function saveCashEntry(_: ActionState, fd: FormData): Promise<ActionState> {
  const lang = langFrom(fd);
  const user = await requireAdmin(lang);
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
  await requireAdmin(lang);
  const id = str(fd, "id");
  if (!UUID_RE.test(id)) return undefined;
  const db = await getDb();
  await db.delete(schema.cashEntries).where(eq(schema.cashEntries.id, id));
  refresh();
  return undefined;
}

export async function saveFinanceSettings(_: ActionState, fd: FormData): Promise<ActionState> {
  const lang = langFrom(fd);
  await requireAdmin(lang);
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
  await requireAdmin(lang);
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
  if (UUID_RE.test(id)) {
    await db.update(schema.expenseCategories).set({ nameEn, nameAr, kind, active: fd.get("active") === "on" }).where(eq(schema.expenseCategories.id, id));
  } else {
    const code = `${nameEn.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 30) || "cat"}_${Date.now().toString(36)}`;
    await db.insert(schema.expenseCategories).values({ code, nameEn, nameAr, kind, sortOrder: 50 });
  }
  refresh();
  return undefined;
}
