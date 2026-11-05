import "server-only";
import { and, eq, gte, inArray, isNotNull, isNull, lt, lte, ne, or, sql } from "drizzle-orm";
import { getDb, schema } from "@/db";
import type { CashEntryKind, PaymentMethod } from "@/db/schema";
import { kuwaitDayRange, todayKuwait } from "@/lib/dates";
import { addDaysIso, daysInMonth, overlapDays } from "@/lib/hr";
import { accrueByMonth, dueSoFar, prepaidPortion, rateSegments, spreadByMonth } from "@/lib/accrual";

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
    depositsOut: number;
    depositsIn: number;
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
      depositsOut: 0,
      depositsIn: 0,
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
  c.investing = c.depositsIn - c.equipment - c.depositsOut;
  c.financing = c.capitalIn + c.loansIn - c.drawings - c.loansOut;
  c.net = c.operating + c.investing + c.financing;
  c.in = customers + c.otherIncome + c.depositsIn + c.capitalIn + c.loansIn;
  c.out = c.expenses + c.suppliers + c.salaries + c.pifss + c.equipment + c.depositsOut + c.drawings + c.loansOut;
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
    for (const k of ["otherIncome", "expenses", "suppliers", "salaries", "pifss", "equipment", "depositsOut", "depositsIn", "capitalIn", "drawings", "loansIn", "loansOut"] as const) t.cash[k] += m.cash[k];
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
export async function financeReport(db: Db, from: string, to: string, opts: { cashFrom?: string } = {}): Promise<FinanceReport> {
  // Cash is only tracked from the opening-balance date; P&L figures are not limited by it.
  const cashFrom = opts.cashFrom ?? "0000-01-01";
  const start = kuwaitDayRange(from)[0];
  const end = kuwaitDayRange(to)[1];
  const keys = monthsBetween(from, to);
  const months = new Map(keys.map((k) => [k, emptyMonth()]));
  const at = (iso: string) => months.get(monthKey(iso));

  const [invoiceLines, invoices, movements, expenseRows, categories, runs, payments, entries, contracts, rates] = await Promise.all([
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
        total: schema.inventoryMovements.totalCostFils,
        paidWith: schema.inventoryMovements.paidWith,
        at: schema.inventoryMovements.createdAt,
      })
      .from(schema.inventoryMovements)
      .where(and(gte(schema.inventoryMovements.createdAt, start), lt(schema.inventoryMovements.createdAt, end))),
    // Paid in the range, or covering part of it (a period payment made earlier or later).
    db
      .select()
      .from(schema.expenses)
      .where(
        or(
          and(gte(schema.expenses.date, from), lte(schema.expenses.date, to)),
          and(isNotNull(schema.expenses.periodFrom), lte(schema.expenses.periodFrom, to), gte(schema.expenses.periodTo, from)),
        ),
      ),
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
    db
      .select()
      .from(schema.recurringCosts)
      .where(and(lte(schema.recurringCosts.startDate, to), or(isNull(schema.recurringCosts.endDate), gte(schema.recurringCosts.endDate, from)))),
    db.select().from(schema.recurringCostRates),
  ]);

  // Revenue: invoice lines by service category, with each invoice's discount kept separate.
  for (const l of invoiceLines) {
    const m = at(kuwaitDate(l.issuedAt));
    if (m) m.revenueByCategory[(l.category ?? "other") as ServiceCategory] += l.amount;
  }
  const linesByInvoice = new Map<string, number>();
  for (const l of invoiceLines) linesByInvoice.set(l.invoiceId, (linesByInvoice.get(l.invoiceId) ?? 0) + l.amount);
  for (const inv of invoices) {
    const m = at(kuwaitDate(inv.issuedAt));
    if (!m) continue;
    m.discounts += inv.discount;
    // If an invoice's subtotal differs from its lines (e.g. lines edited later), book the gap as "other".
    const lines = linesByInvoice.get(inv.id) ?? 0;
    if (lines !== inv.subtotal) m.revenueByCategory.other += inv.subtotal - lines;
  }

  // Stock: materials used by jobs (cost of sales), count corrections, and paid purchases.
  const uncosted = new Set<string>();
  for (const mv of movements) {
    const day = kuwaitDate(mv.at);
    const m = at(day);
    if (!m) continue;
    // Purchases: cash out is exactly what was paid for the delivery.
    if (mv.reason === "restock" && mv.paidWith && mv.total != null) {
      if (day >= cashFrom) m.cash.suppliers += mv.total;
      continue;
    }
    if (mv.cost == null) {
      if (mv.reason === "job") uncosted.add(mv.itemId);
      continue;
    }
    const value = stockValue(mv.delta, mv.cost);
    if (mv.reason === "job" || mv.reason === "job_reversal") m.materials -= value;
    else if (mv.reason === "adjustment") m.stockLoss -= value;
  }

  const kindOf = new Map(categories.map((c) => [c.id, c]));
  // Contract charges and spread costs are booked up to the end of the current month, not into the future.
  const today = todayKuwait();
  const thisMonthEnd = `${today.slice(0, 7)}-${String(daysInMonth(+today.slice(0, 4), +today.slice(5, 7))).padStart(2, "0")}`;
  const accrueTo = to < thisMonthEnd ? to : thisMonthEnd;
  const addOpex = (key: string, code: string, v: number) => {
    const m = months.get(key);
    if (m && v) m.opexByCategory[code] = (m.opexByCategory[code] ?? 0) + v;
  };
  for (const e of expenseRows) {
    const cat = kindOf.get(e.categoryId);
    if (!cat) continue;
    const paidInRange = e.date >= from && e.date <= to;
    const m = paidInRange ? at(e.date) : undefined;
    const inCash = paidInRange && e.date >= cashFrom;
    if (cat.kind === "asset") {
      if (m && inCash) m.cash.equipment += e.amountFils;
      continue;
    }
    if (m && inCash) m.cash.expenses += e.amountFils;
    // Contract payments: the P&L carries the contract's monthly charge instead (below).
    if (e.contractId) continue;
    if (e.periodFrom && e.periodTo) {
      for (const [key, v] of spreadByMonth(e.amountFils, e.periodFrom, e.periodTo, from, accrueTo)) addOpex(key, cat.code, v);
    } else if (m) {
      m.opexByCategory[cat.code] = (m.opexByCategory[cat.code] ?? 0) + e.amountFils;
    }
  }

  // Recurring contracts (rent): each month carries its charge, paid or not.
  for (const c of contracts) {
    const cat = kindOf.get(c.categoryId);
    if (!cat) continue;
    const segments = rateSegments(
      rates.filter((r) => r.contractId === c.id),
      c.startDate,
      c.endDate,
    );
    for (const [key, v] of accrueByMonth(segments, from, accrueTo)) addOpex(key, cat.code, v);
  }

  // Payroll: cost in the payroll month; cash when the run is marked paid.
  for (const r of runs) {
    const key = `${r.year}-${String(r.month).padStart(2, "0")}`;
    const m = months.get(key);
    if (m) {
      // A month's payroll is spread evenly over its days, so a range covering part of a month
      // (custom periods) carries only that share. Whole months get all of it.
      const dim = daysInMonth(r.year, r.month);
      const share = overlapDays(`${key}-01`, `${key}-${String(dim).padStart(2, "0")}`, from, to) / dim;
      m.payrollFixed += r.fixed * share;
      m.payrollExtra += r.extra * share;
      m.employerPifss += r.employerPifss * share;
    }
    if (r.status === "paid" && r.paidAt) {
      const paidDay = kuwaitDate(r.paidAt);
      const pm = at(paidDay);
      if (pm && paidDay >= from && paidDay <= to && paidDay >= cashFrom) {
        pm.cash.salaries += r.net;
        pm.cash.pifss += r.employeePifss + r.employerPifss;
      }
    }
  }

  for (const p of payments) {
    const day = kuwaitDate(p.at);
    const m = at(day);
    if (m && day >= cashFrom) m.cash.fromCustomers[p.method] += p.amount;
  }

  const entryField: Record<CashEntryKind, "capitalIn" | "drawings" | "loansIn" | "loansOut" | "otherIncome" | "depositsOut" | "depositsIn"> = {
    capital_in: "capitalIn",
    owner_drawing: "drawings",
    loan_received: "loansIn",
    loan_repayment: "loansOut",
    other_income: "otherIncome",
    deposit_paid: "depositsOut",
    deposit_refund: "depositsIn",
  };
  for (const e of entries) {
    const m = at(e.date);
    if (!m) continue;
    if (e.date >= cashFrom) m.cash[entryField[e.kind]] += e.amountFils;
    if (e.kind === "other_income") m.otherIncome += e.amountFils;
  }

  // Round to whole fils once, at the end, so stock values don't drift.
  for (const m of months.values()) {
    m.materials = Math.round(m.materials);
    m.stockLoss = Math.round(m.stockLoss);
    m.payrollFixed = Math.round(m.payrollFixed);
    m.payrollExtra = Math.round(m.payrollExtra);
    m.employerPifss = Math.round(m.employerPifss);
    for (const k of Object.keys(m.opexByCategory)) m.opexByCategory[k] = Math.round(m.opexByCategory[k]);
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
  const before = await financeReport(db, s.openingDate, addDaysIso(date, -1), { cashFrom: s.openingDate });
  return s.openingCashFils + before.total.cash.net;
}

/** Unpaid invoice balances today (all time, excluding void invoices). Overpaid invoices count as zero. */
export async function receivables(db: Db): Promise<number> {
  const paid = db
    .select({ invoiceId: schema.payments.invoiceId, amount: sql<number>`sum(${schema.payments.amountFils})`.as("amount") })
    .from(schema.payments)
    .groupBy(schema.payments.invoiceId)
    .as("paid");
  const [row] = await db
    .select({ v: sql<number>`coalesce(sum(greatest(${schema.invoices.totalFils} - coalesce(${paid.amount}, 0), 0)), 0)::bigint` })
    .from(schema.invoices)
    .leftJoin(paid, eq(paid.invoiceId, schema.invoices.id))
    .where(ne(schema.invoices.status, "void"));
  return Number(row.v);
}

export type ContractStatus = {
  id: string;
  name: string;
  vendor: string | null;
  categoryId: string;
  startDate: string;
  endDate: string | null;
  dueDay: number;
  notes: string | null;
  /** Monthly amount in force on `asOf` (or the last one, if the contract has ended). */
  monthly: number;
  dueSoFar: number;
  paid: number;
  /** Positive: payments are behind by this much. Negative: paid ahead. */
  balance: number;
  ended: boolean;
};

/** Every contract with what has fallen due and what has been paid up to `asOf`. */
export async function contractStatuses(db: Db, asOf: string): Promise<ContractStatus[]> {
  const [contracts, rates, paid] = await Promise.all([
    db.select().from(schema.recurringCosts).orderBy(schema.recurringCosts.startDate),
    db.select().from(schema.recurringCostRates),
    db
      .select({ contractId: schema.expenses.contractId, v: sql<number>`coalesce(sum(${schema.expenses.amountFils}), 0)::bigint` })
      .from(schema.expenses)
      .where(and(isNotNull(schema.expenses.contractId), lte(schema.expenses.date, asOf)))
      .groupBy(schema.expenses.contractId),
  ]);
  const paidBy = new Map(paid.map((p) => [p.contractId, Number(p.v)]));
  return contracts.map((c) => {
    const own = rates.filter((r) => r.contractId === c.id);
    const segments = rateSegments(own, c.startDate, c.endDate);
    const current = segments.filter((s) => s.from <= asOf).at(-1) ?? segments[0];
    const due = Math.round(dueSoFar(segments, c.startDate, c.endDate, c.dueDay, asOf));
    const p = paidBy.get(c.id) ?? 0;
    return { ...c, monthly: current?.monthly ?? 0, dueSoFar: due, paid: p, balance: due - p, ended: !!c.endDate && c.endDate < asOf };
  });
}

/** Expenses paid on or before `asOf` for a period that isn't used up yet (e.g. insurance paid a year ahead). */
export async function prepaidExpenses(db: Db, asOf: string): Promise<number> {
  const rows = await db
    .select({ amount: schema.expenses.amountFils, date: schema.expenses.date, from: schema.expenses.periodFrom, to: schema.expenses.periodTo })
    .from(schema.expenses)
    .where(and(isNull(schema.expenses.contractId), isNotNull(schema.expenses.periodFrom), lte(schema.expenses.date, asOf), sql`${schema.expenses.periodTo} > ${asOf}`));
  return Math.round(rows.reduce((a, r) => a + prepaidPortion(r.amount, r.date, r.from!, r.to!, asOf), 0));
}
