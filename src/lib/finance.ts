import "server-only";
import { and, eq, gte, inArray, isNotNull, lt, lte, ne, sql } from "drizzle-orm";
import { getDb, schema } from "@/db";
import type { CashEntryKind, PaymentMethod } from "@/db/schema";
import { kuwaitDayRange } from "@/lib/dates";
import { addDaysIso } from "@/lib/hr";

type Db = Awaited<ReturnType<typeof getDb>>;
type ServiceCategory = "ppf" | "ceramic" | "tint" | "detailing" | "other";

/** Kuwait is UTC+3 all year: the Kuwait calendar date of an instant. */
export const kuwaitDate = (d: Date) => new Date(d.getTime() + 3 * 3_600_000).toISOString().slice(0, 10);
const monthKey = (iso: string) => iso.slice(0, 7);
/** Cost value in fils of a stock quantity (thousandths of a unit) at a per-unit cost. */
const stockValue = (deltaMilli: number, unitCostFils: number) => (deltaMilli * unitCostFils) / 1000;

export type MonthFigures = {
  // Profit & loss (accrual)
  revenueByCategory: Record<ServiceCategory, number>;
  discounts: number;
  netRevenue: number;
  materials: number;
  grossProfit: number;
  opexByCategory: Record<string, number>;
  payrollFixed: number;
  payrollExtra: number;
  employerPifss: number;
  stockLoss: number;
  totalOpex: number;
  operatingProfit: number;
  otherIncome: number;
  netProfit: number;
  // Cash flow (cash basis)
  cash: {
    fromCustomers: Record<PaymentMethod, number>;
    otherIncome: number;
    expenses: number;
    suppliers: number;
    salaries: number;
    pifss: number;
    equipment: number;
    capitalIn: number;
    drawings: number;
    loansIn: number;
    loansOut: number;
    operating: number;
    investing: number;
    financing: number;
    net: number;
    in: number;
    out: number;
  };
};

function emptyMonth(): MonthFigures {
  return {
    revenueByCategory: { ppf: 0, ceramic: 0, tint: 0, detailing: 0, other: 0 },
    discounts: 0,
    netRevenue: 0,
    materials: 0,
    grossProfit: 0,
    opexByCategory: {},
    payrollFixed: 0,
    payrollExtra: 0,
    employerPifss: 0,
    stockLoss: 0,
    totalOpex: 0,
    operatingProfit: 0,
    otherIncome: 0,
    netProfit: 0,
    cash: {
      fromCustomers: { cash: 0, knet: 0, card: 0, transfer: 0 },
      otherIncome: 0,
      expenses: 0,
      suppliers: 0,
      salaries: 0,
      pifss: 0,
      equipment: 0,
      capitalIn: 0,
      drawings: 0,
      loansIn: 0,
      loansOut: 0,
      operating: 0,
      investing: 0,
      financing: 0,
      net: 0,
      in: 0,
      out: 0,
    },
  };
}

/** Works out totals and the profit / cash lines from the raw amounts in a month. */
function finish(m: MonthFigures): MonthFigures {
  const gross = Object.values(m.revenueByCategory).reduce((a, b) => a + b, 0);
  m.netRevenue = gross - m.discounts;
  m.grossProfit = m.netRevenue - m.materials;
  m.totalOpex = Object.values(m.opexByCategory).reduce((a, b) => a + b, 0) + m.payrollFixed + m.payrollExtra + m.employerPifss + m.stockLoss;
  m.operatingProfit = m.grossProfit - m.totalOpex;
  m.netProfit = m.operatingProfit + m.otherIncome;
  const c = m.cash;
  const customers = Object.values(c.fromCustomers).reduce((a, b) => a + b, 0);
  c.operating = customers + c.otherIncome - c.expenses - c.suppliers - c.salaries - c.pifss;
  c.investing = -c.equipment;
  c.financing = c.capitalIn + c.loansIn - c.drawings - c.loansOut;
  c.net = c.operating + c.investing + c.financing;
  c.in = customers + c.otherIncome + c.capitalIn + c.loansIn;
  c.out = c.expenses + c.suppliers + c.salaries + c.pifss + c.equipment + c.drawings + c.loansOut;
  return m;
}

/** Adds month figures together (for a quarter, a year or any range). */
export function sumMonths(months: MonthFigures[]): MonthFigures {
  const t = emptyMonth();
  for (const m of months) {
    for (const k of Object.keys(t.revenueByCategory) as ServiceCategory[]) t.revenueByCategory[k] += m.revenueByCategory[k];
    for (const [k, v] of Object.entries(m.opexByCategory)) t.opexByCategory[k] = (t.opexByCategory[k] ?? 0) + v;
    t.discounts += m.discounts;
    t.materials += m.materials;
    t.payrollFixed += m.payrollFixed;
    t.payrollExtra += m.payrollExtra;
    t.employerPifss += m.employerPifss;
    t.stockLoss += m.stockLoss;
    t.otherIncome += m.otherIncome;
    for (const k of Object.keys(t.cash.fromCustomers) as PaymentMethod[]) t.cash.fromCustomers[k] += m.cash.fromCustomers[k];
    for (const k of ["otherIncome", "expenses", "suppliers", "salaries", "pifss", "equipment", "capitalIn", "drawings", "loansIn", "loansOut"] as const) t.cash[k] += m.cash[k];
  }
  return finish(t);
}

/** Every month key ("YYYY-MM") from one date to another, inclusive. */
export function monthsBetween(from: string, to: string): string[] {
  const out: string[] = [];
  let y = +from.slice(0, 4);
  let m = +from.slice(5, 7);
  while (`${y}-${String(m).padStart(2, "0")}` <= to.slice(0, 7)) {
    out.push(`${y}-${String(m).padStart(2, "0")}`);
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return out;
}

export type FinanceReport = {
  from: string;
  to: string;
  months: { key: string; figures: MonthFigures }[];
  total: MonthFigures;
  /** Inventory items whose job usage in the range had no cost recorded. */
  uncostedItems: number;
  categories: { id: string; code: string; nameEn: string; nameAr: string; kind: "operating" | "asset" }[];
};

/**
 * Builds month-by-month P&L and cash-flow figures for [from, to] (Kuwait calendar dates,
 * inclusive) from invoices, payments, stock movements, expenses, payroll and cash entries.
 */
export async function financeReport(db: Db, from: string, to: string): Promise<FinanceReport> {
  const start = kuwaitDayRange(from)[0];
  const end = kuwaitDayRange(to)[1];
  const keys = monthsBetween(from, to);
  const months = new Map(keys.map((k) => [k, emptyMonth()]));
  const at = (iso: string) => months.get(monthKey(iso));

  const [invoiceLines, invoices, movements, expenseRows, categories, runs, payments, entries] = await Promise.all([
    db
      .select({
        invoiceId: schema.invoices.id,
        issuedAt: schema.invoices.issuedAt,
        amount: sql<number>`(${schema.jobItems.priceFils} * ${schema.jobItems.quantity})::int`,
        category: schema.services.category,
      })
      .from(schema.invoices)
      .innerJoin(schema.jobItems, eq(schema.jobItems.jobId, schema.invoices.jobId))
      .leftJoin(schema.services, eq(schema.jobItems.serviceId, schema.services.id))
      .where(and(gte(schema.invoices.issuedAt, start), lt(schema.invoices.issuedAt, end), ne(schema.invoices.status, "void"))),
    db
      .select({ id: schema.invoices.id, issuedAt: schema.invoices.issuedAt, subtotal: schema.invoices.subtotalFils, discount: schema.invoices.discountFils, total: schema.invoices.totalFils })
      .from(schema.invoices)
      .where(and(gte(schema.invoices.issuedAt, start), lt(schema.invoices.issuedAt, end), ne(schema.invoices.status, "void"))),
    db
      .select({
        itemId: schema.inventoryMovements.itemId,
        delta: schema.inventoryMovements.deltaMilli,
        reason: schema.inventoryMovements.reason,
        cost: schema.inventoryMovements.unitCostFils,
        paidWith: schema.inventoryMovements.paidWith,
        at: schema.inventoryMovements.createdAt,
      })
      .from(schema.inventoryMovements)
      .where(and(gte(schema.inventoryMovements.createdAt, start), lt(schema.inventoryMovements.createdAt, end))),
    db.select().from(schema.expenses).where(and(gte(schema.expenses.date, from), lte(schema.expenses.date, to))),
    db
      .select({ id: schema.expenseCategories.id, code: schema.expenseCategories.code, nameEn: schema.expenseCategories.nameEn, nameAr: schema.expenseCategories.nameAr, kind: schema.expenseCategories.kind })
      .from(schema.expenseCategories)
      .orderBy(schema.expenseCategories.sortOrder),
    db
      .select({
        year: schema.payrollRuns.year,
        month: schema.payrollRuns.month,
        status: schema.payrollRuns.status,
        paidAt: schema.payrollRuns.paidAt,
        fixed: sql<number>`coalesce(sum(${schema.payslips.basicFils} + ${schema.payslips.housingFils} + ${schema.payslips.transportFils} + ${schema.payslips.otherAllowanceFils} - ${schema.payslips.unpaidLeaveFils} - ${schema.payslips.absenceFils}), 0)::int`,
        extra: sql<number>`coalesce(sum(${schema.payslips.overtimeFils} + ${schema.payslips.bonusFils}), 0)::int`,
        employerPifss: sql<number>`coalesce(sum(${schema.payslips.pifssEmployerFils}), 0)::int`,
        employeePifss: sql<number>`coalesce(sum(${schema.payslips.pifssEmployeeFils}), 0)::int`,
        net: sql<number>`coalesce(sum(${schema.payslips.netFils}), 0)::int`,
      })
      .from(schema.payrollRuns)
      .leftJoin(schema.payslips, eq(schema.payslips.runId, schema.payrollRuns.id))
      .where(inArray(schema.payrollRuns.status, ["approved", "paid"]))
      .groupBy(schema.payrollRuns.id),
    db
      .select({ amount: schema.payments.amountFils, method: schema.payments.method, at: schema.payments.paidAt })
      .from(schema.payments)
      .where(and(gte(schema.payments.paidAt, start), lt(schema.payments.paidAt, end))),
    db.select().from(schema.cashEntries).where(and(gte(schema.cashEntries.date, from), lte(schema.cashEntries.date, to))),
  ]);

  // Revenue: invoice lines by service category, with each invoice's discount kept separate.
  for (const l of invoiceLines) {
    const m = at(kuwaitDate(l.issuedAt));
    if (m) m.revenueByCategory[(l.category ?? "other") as ServiceCategory] += l.amount;
  }
  for (const inv of invoices) {
    const m = at(kuwaitDate(inv.issuedAt));
    if (!m) continue;
    m.discounts += inv.discount;
    // If an invoice's subtotal differs from its lines (e.g. lines edited later), book the gap as "other".
    const lines = invoiceLines.filter((l) => l.invoiceId === inv.id).reduce((a, l) => a + l.amount, 0);
    if (lines !== inv.subtotal) m.revenueByCategory.other += inv.subtotal - lines;
  }

  // Stock: materials used by jobs (cost of sales), count corrections, and paid purchases.
  const uncosted = new Set<string>();
  for (const mv of movements) {
    const m = at(kuwaitDate(mv.at));
    if (!m) continue;
    if (mv.cost == null) {
      if (mv.reason === "job") uncosted.add(mv.itemId);
      continue;
    }
    const value = stockValue(mv.delta, mv.cost);
    if (mv.reason === "job" || mv.reason === "job_reversal") m.materials -= value;
    else if (mv.reason === "adjustment") m.stockLoss -= value;
    else if (mv.reason === "restock" && mv.paidWith) m.cash.suppliers += value;
  }

  const kindOf = new Map(categories.map((c) => [c.id, c]));
  for (const e of expenseRows) {
    const m = at(e.date);
    const cat = kindOf.get(e.categoryId);
    if (!m || !cat) continue;
    if (cat.kind === "asset") m.cash.equipment += e.amountFils;
    else {
      m.opexByCategory[cat.code] = (m.opexByCategory[cat.code] ?? 0) + e.amountFils;
      m.cash.expenses += e.amountFils;
    }
  }

  // Payroll: cost in the payroll month; cash when the run is marked paid.
  for (const r of runs) {
    const m = months.get(`${r.year}-${String(r.month).padStart(2, "0")}`);
    if (m) {
      m.payrollFixed += r.fixed;
      m.payrollExtra += r.extra;
      m.employerPifss += r.employerPifss;
    }
    if (r.status === "paid" && r.paidAt) {
      const pm = at(kuwaitDate(r.paidAt));
      if (pm && kuwaitDate(r.paidAt) >= from && kuwaitDate(r.paidAt) <= to) {
        pm.cash.salaries += r.net;
        pm.cash.pifss += r.employeePifss + r.employerPifss;
      }
    }
  }

  for (const p of payments) {
    const m = at(kuwaitDate(p.at));
    if (m) m.cash.fromCustomers[p.method] += p.amount;
  }

  const entryField: Record<CashEntryKind, "capitalIn" | "drawings" | "loansIn" | "loansOut" | "otherIncome"> = {
    capital_in: "capitalIn",
    owner_drawing: "drawings",
    loan_received: "loansIn",
    loan_repayment: "loansOut",
    other_income: "otherIncome",
  };
  for (const e of entries) {
    const m = at(e.date);
    if (!m) continue;
    m.cash[entryField[e.kind]] += e.amountFils;
    if (e.kind === "other_income") m.otherIncome += e.amountFils;
  }

  // Round to whole fils once, at the end, so stock values don't drift.
  for (const m of months.values()) {
    m.materials = Math.round(m.materials);
    m.stockLoss = Math.round(m.stockLoss);
    m.cash.suppliers = Math.round(m.cash.suppliers);
    finish(m);
  }
  const list = keys.map((key) => ({ key, figures: months.get(key)! }));
  return { from, to, months: list, total: sumMonths(list.map((x) => x.figures)), uncostedItems: uncosted.size, categories };
}

export async function getFinanceSettings(db: Db) {
  const [row] = await db.select().from(schema.financeSettings).where(eq(schema.financeSettings.id, 1)).limit(1);
  return row ?? { id: 1, openingCashFils: 0, openingDate: "2026-01-01", updatedAt: new Date() };
}

/**
 * Cash on hand at the start of `date`: the opening balance plus every cash movement from the
 * opening date up to the day before. Dates before the opening date return the opening balance.
 */
export async function cashAt(db: Db, date: string): Promise<number> {
  const s = await getFinanceSettings(db);
  if (date <= s.openingDate) return s.openingCashFils;
  const before = await financeReport(db, s.openingDate, addDaysIso(date, -1));
  return s.openingCashFils + before.total.cash.net;
}

/** Unpaid invoice balances today (all time, excluding void invoices). */
export async function receivables(db: Db): Promise<number> {
  const [[inv], [paid]] = await Promise.all([
    db.select({ v: sql<number>`coalesce(sum(${schema.invoices.totalFils}), 0)::bigint` }).from(schema.invoices).where(ne(schema.invoices.status, "void")),
    db
      .select({ v: sql<number>`coalesce(sum(${schema.payments.amountFils}), 0)::bigint` })
      .from(schema.payments)
      .innerJoin(schema.invoices, eq(schema.payments.invoiceId, schema.invoices.id))
      .where(and(ne(schema.invoices.status, "void"), isNotNull(schema.payments.amountFils))),
  ]);
  return Number(inv.v) - Number(paid.v);
}
