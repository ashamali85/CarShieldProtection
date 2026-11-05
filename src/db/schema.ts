import {
  pgTable,
  pgEnum,
  uuid,
  text,
  integer,
  boolean,
  timestamp,
  date,
  serial,
  index,
  uniqueIndex,
  jsonb,
} from "drizzle-orm/pg-core";

/**
 * Money is stored as integer fils (1 KWD = 1000 fils) to avoid rounding errors.
 */

export const userRole = pgEnum("user_role", ["admin", "staff", "technician"]);

export const serviceCategory = pgEnum("service_category", [
  "ppf",
  "ceramic",
  "tint",
  "detailing",
  "other",
]);

export const jobStatus = pgEnum("job_status", [
  "scheduled",
  "in_progress",
  "quality_check",
  "completed",
  "delivered",
  "cancelled",
]);

export const invoiceStatus = pgEnum("invoice_status", [
  "unpaid",
  "partial",
  "paid",
  "void",
]);

export const paymentMethod = pgEnum("payment_method", [
  "cash",
  "knet",
  "card",
  "transfer",
]);

export const warrantyStatus = pgEnum("warranty_status", ["active", "void"]);

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  role: userRole("role").notNull().default("staff"),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const customers = pgTable(
  "customers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    phone: text("phone").notNull(),
    email: text("email"),
    civilId: text("civil_id"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("customers_phone_idx").on(t.phone)],
);

export const bodyType = pgEnum("body_type", [
  "sedan",
  "hatchback",
  "coupe",
  "convertible",
  "suv",
  "pickup",
  "van",
  "minivan",
  "wagon",
]);

/** Car catalog used by the vehicle picker: brand → body type → model → year. */
export const carMakes = pgTable("car_makes", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull().unique(),
  nameAr: text("name_ar").notNull(),
  /** Custom logo uploaded by an admin (a small data: URL). Null means use the bundled logo for the brand, if any. */
  logoUrl: text("logo_url"),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const carModels = pgTable(
  "car_models",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    makeId: uuid("make_id")
      .notNull()
      .references(() => carMakes.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    bodyType: bodyType("body_type").notNull(),
    yearFrom: integer("year_from").notNull(),
    /** Null while the model is still on sale. */
    yearTo: integer("year_to"),
    active: boolean("active").notNull().default(true),
  },
  (t) => [
    uniqueIndex("car_models_make_name_body_uq").on(t.makeId, t.name, t.bodyType),
    index("car_models_make_idx").on(t.makeId),
  ],
);

export const vehicles = pgTable(
  "vehicles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "cascade" }),
    make: text("make").notNull(),
    model: text("model").notNull(),
    /** Set when the car was picked from the catalog; make/model text stays as a snapshot. */
    modelId: uuid("model_id").references(() => carModels.id, { onDelete: "set null" }),
    bodyType: bodyType("body_type"),
    year: integer("year"),
    color: text("color"),
    plateNumber: text("plate_number").notNull(),
    vin: text("vin"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("vehicles_customer_idx").on(t.customerId),
    index("vehicles_plate_idx").on(t.plateNumber),
  ],
);

export const services = pgTable("services", {
  id: uuid("id").primaryKey().defaultRandom(),
  nameEn: text("name_en").notNull(),
  nameAr: text("name_ar").notNull(),
  category: serviceCategory("category").notNull().default("other"),
  priceFils: integer("price_fils").notNull().default(0),
  warrantyMonths: integer("warranty_months").notNull().default(0),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const jobs = pgTable(
  "jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    number: serial("number").notNull().unique(),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "restrict" }),
    vehicleId: uuid("vehicle_id")
      .notNull()
      .references(() => vehicles.id, { onDelete: "restrict" }),
    technicianId: uuid("technician_id").references(() => users.id, {
      onDelete: "set null",
    }),
    status: jobStatus("status").notNull().default("scheduled"),
    scheduledAt: timestamp("scheduled_at", { withTimezone: true }),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    discountFils: integer("discount_fils").notNull().default(0),
    notes: text("notes"),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("jobs_status_idx").on(t.status),
    index("jobs_customer_idx").on(t.customerId),
    index("jobs_vehicle_idx").on(t.vehicleId),
  ],
);

export const jobItems = pgTable(
  "job_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    jobId: uuid("job_id")
      .notNull()
      .references(() => jobs.id, { onDelete: "cascade" }),
    serviceId: uuid("service_id").references(() => services.id, { onDelete: "set null" }),
    /** Snapshot of the service names and terms at the time of the job. */
    nameEn: text("name_en").notNull(),
    nameAr: text("name_ar").notNull(),
    priceFils: integer("price_fils").notNull(),
    quantity: integer("quantity").notNull().default(1),
    warrantyMonths: integer("warranty_months").notNull().default(0),
  },
  (t) => [index("job_items_job_idx").on(t.jobId)],
);

export const invoices = pgTable("invoices", {
  id: uuid("id").primaryKey().defaultRandom(),
  number: serial("number").notNull().unique(),
  jobId: uuid("job_id")
    .notNull()
    .unique()
    .references(() => jobs.id, { onDelete: "restrict" }),
  subtotalFils: integer("subtotal_fils").notNull(),
  discountFils: integer("discount_fils").notNull().default(0),
  totalFils: integer("total_fils").notNull(),
  status: invoiceStatus("status").notNull().default("unpaid"),
  issuedAt: timestamp("issued_at", { withTimezone: true }).notNull().defaultNow(),
});

export const payments = pgTable(
  "payments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    invoiceId: uuid("invoice_id")
      .notNull()
      .references(() => invoices.id, { onDelete: "cascade" }),
    amountFils: integer("amount_fils").notNull(),
    method: paymentMethod("method").notNull(),
    reference: text("reference"),
    receivedBy: uuid("received_by").references(() => users.id, { onDelete: "set null" }),
    paidAt: timestamp("paid_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("payments_invoice_idx").on(t.invoiceId)],
);

export const warranties = pgTable(
  "warranties",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    code: text("code").notNull().unique(),
    jobId: uuid("job_id")
      .notNull()
      .references(() => jobs.id, { onDelete: "cascade" }),
    jobItemId: uuid("job_item_id")
      .notNull()
      .unique()
      .references(() => jobItems.id, { onDelete: "cascade" }),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "cascade" }),
    vehicleId: uuid("vehicle_id")
      .notNull()
      .references(() => vehicles.id, { onDelete: "cascade" }),
    nameEn: text("name_en").notNull(),
    nameAr: text("name_ar").notNull(),
    startsOn: date("starts_on").notNull(),
    endsOn: date("ends_on").notNull(),
    status: warrantyStatus("status").notNull().default("active"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("warranties_ends_idx").on(t.endsOn)],
);

/**
 * Inventory quantities are stored as integer thousandths of a unit ("milli")
 * so 1.5 m of film is 1500 and arithmetic stays exact.
 */
export const inventoryUnit = pgEnum("inventory_unit", ["piece", "roll", "meter", "sqm", "ml", "liter", "box", "pack"]);

export const movementReason = pgEnum("movement_reason", ["job", "job_reversal", "restock", "adjustment"]);

export const inventoryItems = pgTable("inventory_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  nameEn: text("name_en").notNull(),
  nameAr: text("name_ar").notNull(),
  sku: text("sku"),
  unit: inventoryUnit("unit").notNull().default("piece"),
  onHandMilli: integer("on_hand_milli").notNull().default(0),
  reorderLevelMilli: integer("reorder_level_milli").notNull().default(0),
  unitCostFils: integer("unit_cost_fils"),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** How much of each inventory item one unit of a service consumes. */
export const serviceMaterials = pgTable(
  "service_materials",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    serviceId: uuid("service_id")
      .notNull()
      .references(() => services.id, { onDelete: "cascade" }),
    itemId: uuid("item_id")
      .notNull()
      .references(() => inventoryItems.id, { onDelete: "cascade" }),
    quantityMilli: integer("quantity_milli").notNull(),
  },
  (t) => [uniqueIndex("service_materials_service_item_uq").on(t.serviceId, t.itemId)],
);

/** Every stock change. Job consumption is recorded per job item so it can be reversed exactly. */
export const inventoryMovements = pgTable(
  "inventory_movements",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    itemId: uuid("item_id")
      .notNull()
      .references(() => inventoryItems.id, { onDelete: "cascade" }),
    deltaMilli: integer("delta_milli").notNull(),
    reason: movementReason("reason").notNull(),
    jobId: uuid("job_id").references(() => jobs.id, { onDelete: "set null" }),
    jobItemId: uuid("job_item_id").references(() => jobItems.id, { onDelete: "set null" }),
    note: text("note"),
    /**
     * Cost per unit (fils per whole unit) at the time of the movement: the purchase price for a
     * restock, the item's average cost for everything else. Null on rows recorded before costs.
     */
    unitCostFils: integer("unit_cost_fils"),
    /** Restocks only: who it was bought from and how it was paid. */
    supplier: text("supplier"),
    paidWith: paymentMethod("paid_with"),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("inventory_movements_item_idx").on(t.itemId), index("inventory_movements_job_idx").on(t.jobId)],
);

export type InventoryItem = typeof inventoryItems.$inferSelect;
export type InventoryUnit = (typeof inventoryUnit.enumValues)[number];
export type MovementReason = (typeof movementReason.enumValues)[number];

export type User = typeof users.$inferSelect;
export type Customer = typeof customers.$inferSelect;
export type Vehicle = typeof vehicles.$inferSelect;
// ───────────────────────────── HR ─────────────────────────────
// Leave days are whole days. Fractional "unpaid-equivalent" days (e.g. sick leave at 75% pay)
// are stored in hundredths of a day; overtime hours in hundredths of an hour.

export const employeeStatus = pgEnum("employee_status", ["active", "terminated"]);
export const gender = pgEnum("gender", ["male", "female"]);
export const contractType = pgEnum("contract_type", ["unlimited", "fixed"]);
export const separationReason = pgEnum("separation_reason", ["resignation", "termination", "contract_end", "retirement", "death", "other"]);
export const leaveStatus = pgEnum("leave_status", ["pending", "approved", "rejected", "cancelled"]);
export const payrollStatus = pgEnum("payroll_status", ["draft", "approved", "paid"]);

export const employees = pgTable(
  "employees",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    code: serial("code").notNull().unique(),
    /** Optional link to an app login (e.g. a technician who also uses the system). */
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    fullName: text("full_name").notNull(),
    fullNameAr: text("full_name_ar"),
    gender: gender("gender").notNull().default("male"),
    nationality: text("nationality").notNull(),
    /** Kuwaiti nationals are insured with PIFSS; contributions are deducted in payroll. */
    isKuwaiti: boolean("is_kuwaiti").notNull().default(false),
    dateOfBirth: date("date_of_birth"),
    phone: text("phone"),
    email: text("email"),
    jobTitle: text("job_title").notNull(),
    department: text("department"),
    hireDate: date("hire_date").notNull(),
    contractType: contractType("contract_type").notNull().default("unlimited"),
    contractEnd: date("contract_end"),
    civilId: text("civil_id"),
    civilIdExpiry: date("civil_id_expiry"),
    passportNo: text("passport_no"),
    passportExpiry: date("passport_expiry"),
    residencyExpiry: date("residency_expiry"),
    basicSalaryFils: integer("basic_salary_fils").notNull(),
    housingAllowanceFils: integer("housing_allowance_fils").notNull().default(0),
    transportAllowanceFils: integer("transport_allowance_fils").notNull().default(0),
    otherAllowanceFils: integer("other_allowance_fils").notNull().default(0),
    /** Salary registered with PIFSS; null = basic + fixed allowances. */
    pifssSalaryFils: integer("pifss_salary_fils"),
    /** Annual-leave days carried in when the employee was added (for existing staff). */
    leaveOpeningDays: integer("leave_opening_days").notNull().default(0),
    bankName: text("bank_name"),
    iban: text("iban"),
    status: employeeStatus("status").notNull().default("active"),
    endDate: date("end_date"),
    separationReason: separationReason("separation_reason"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("employees_status_idx").on(t.status)],
);

/** One pay band of a leave type: the next `days` days are paid at `pct` %. `days: null` = no limit. */
export type PayTier = { days: number | null; pct: number };

export const leaveTypes = pgTable("leave_types", {
  id: uuid("id").primaryKey().defaultRandom(),
  code: text("code").notNull().unique(),
  nameEn: text("name_en").notNull(),
  nameAr: text("name_ar").notNull(),
  /** Days allowed per period; null = no limit. */
  allowanceDays: integer("allowance_days"),
  /** "year" = per calendar year, "service" = once in the employee's service, "accrual" = earned monthly (annual leave). */
  period: text("period").$type<"year" | "service" | "accrual" | "event">().notNull().default("year"),
  /** Pay bands applied in order to days taken within the period. */
  payTiers: jsonb("pay_tiers").$type<PayTier[]>().notNull(),
  minServiceMonths: integer("min_service_months").notNull().default(0),
  femaleOnly: boolean("female_only").notNull().default(false),
  active: boolean("active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
});

export const leaveRequests = pgTable(
  "leave_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    employeeId: uuid("employee_id")
      .notNull()
      .references(() => employees.id, { onDelete: "cascade" }),
    leaveTypeId: uuid("leave_type_id")
      .notNull()
      .references(() => leaveTypes.id, { onDelete: "restrict" }),
    startDate: date("start_date").notNull(),
    endDate: date("end_date").notNull(),
    days: integer("days").notNull(),
    status: leaveStatus("status").notNull().default("approved"),
    /** How the days split across pay bands, worked out when approved. */
    payBreakdown: jsonb("pay_breakdown").$type<{ days: number; pct: number }[]>(),
    /** Days of pay lost, in hundredths (e.g. 10 days at 75% = 250). */
    unpaidCentiDays: integer("unpaid_centi_days").notNull().default(0),
    reason: text("reason"),
    decidedById: uuid("decided_by_id").references(() => users.id, { onDelete: "set null" }),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    createdById: uuid("created_by_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("leave_requests_employee_idx").on(t.employeeId), index("leave_requests_dates_idx").on(t.startDate, t.endDate)],
);

export const payrollRuns = pgTable(
  "payroll_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    year: integer("year").notNull(),
    month: integer("month").notNull(),
    status: payrollStatus("status").notNull().default("draft"),
    notes: text("notes"),
    createdById: uuid("created_by_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    paidAt: timestamp("paid_at", { withTimezone: true }),
  },
  (t) => [uniqueIndex("payroll_runs_period_uq").on(t.year, t.month)],
);

export const payslips = pgTable(
  "payslips",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    runId: uuid("run_id")
      .notNull()
      .references(() => payrollRuns.id, { onDelete: "cascade" }),
    employeeId: uuid("employee_id")
      .notNull()
      .references(() => employees.id, { onDelete: "restrict" }),
    /** Snapshot of the employee at the time of the run. */
    employeeName: text("employee_name").notNull(),
    jobTitle: text("job_title").notNull(),
    isKuwaiti: boolean("is_kuwaiti").notNull(),
    iban: text("iban"),
    bankName: text("bank_name"),
    /** Calendar days employed in the month (for joiners and leavers). */
    daysEmployed: integer("days_employed").notNull(),
    daysInMonth: integer("days_in_month").notNull(),
    basicFils: integer("basic_fils").notNull(),
    housingFils: integer("housing_fils").notNull(),
    transportFils: integer("transport_fils").notNull(),
    otherAllowanceFils: integer("other_allowance_fils").notNull(),
    overtimeNormalCentiHours: integer("overtime_normal_centi_hours").notNull().default(0),
    overtimeRestCentiHours: integer("overtime_rest_centi_hours").notNull().default(0),
    overtimeHolidayCentiHours: integer("overtime_holiday_centi_hours").notNull().default(0),
    overtimeFils: integer("overtime_fils").notNull().default(0),
    bonusFils: integer("bonus_fils").notNull().default(0),
    unpaidLeaveCentiDays: integer("unpaid_leave_centi_days").notNull().default(0),
    unpaidLeaveFils: integer("unpaid_leave_fils").notNull().default(0),
    absenceDays: integer("absence_days").notNull().default(0),
    absenceFils: integer("absence_fils").notNull().default(0),
    otherDeductionFils: integer("other_deduction_fils").notNull().default(0),
    pifssEmployeeFils: integer("pifss_employee_fils").notNull().default(0),
    pifssEmployerFils: integer("pifss_employer_fils").notNull().default(0),
    grossFils: integer("gross_fils").notNull(),
    deductionsFils: integer("deductions_fils").notNull(),
    netFils: integer("net_fils").notNull(),
    note: text("note"),
  },
  (t) => [uniqueIndex("payslips_run_employee_uq").on(t.runId, t.employeeId)],
);

/** Payroll rules (PIFSS rates and caps, overtime multipliers, daily-rate divisor). One row, id = 1. */
export const hrSettings = pgTable("hr_settings", {
  id: integer("id").primaryKey().default(1),
  settings: jsonb("settings").$type<HrSettings>().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type HrSettings = {
  /** Monthly salary ÷ this = daily wage (used for unpaid leave, absence and leave encashment). */
  dailyRateDivisor: number;
  /** Standard working hours per day, for the hourly overtime rate. */
  hoursPerDay: number;
  overtimeNormalPct: number;
  overtimeRestDayPct: number;
  overtimeHolidayPct: number;
  pifss: {
    /** Upper limit of the basic-insurance band, in fils. */
    basicCapFils: number;
    /** Upper limit of the supplementary band (and of the other contributions), in fils. */
    totalCapFils: number;
    /** Upper limit for the financial-remuneration contribution, in fils. */
    remunerationCapFils: number;
    employee: { basic: number; supplementary: number; pensionIncrease: number; unemployment: number; remuneration: number };
    employer: { basic: number; supplementary: number; pensionIncrease: number; unemployment: number };
  };
};

export type Employee = typeof employees.$inferSelect;
export type LeaveType = typeof leaveTypes.$inferSelect;
export type LeaveRequest = typeof leaveRequests.$inferSelect;
export type PayrollRun = typeof payrollRuns.$inferSelect;
export type Payslip = typeof payslips.$inferSelect;
export type EmployeeStatus = (typeof employeeStatus.enumValues)[number];
export type SeparationReason = (typeof separationReason.enumValues)[number];
export type LeaveStatus = (typeof leaveStatus.enumValues)[number];
export type PayrollStatus = (typeof payrollStatus.enumValues)[number];

// ─────────────────────────── Finance ───────────────────────────

/** "operating" costs go to the P&L; "asset" purchases (equipment) only to the cash flow as investing. */
export const expenseKind = pgEnum("expense_kind", ["operating", "asset"]);
export const cashEntryKind = pgEnum("cash_entry_kind", ["capital_in", "owner_drawing", "loan_received", "loan_repayment", "other_income"]);

export const expenseCategories = pgTable("expense_categories", {
  id: uuid("id").primaryKey().defaultRandom(),
  code: text("code").notNull().unique(),
  nameEn: text("name_en").notNull(),
  nameAr: text("name_ar").notNull(),
  kind: expenseKind("kind").notNull().default("operating"),
  active: boolean("active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
});

export const expenses = pgTable(
  "expenses",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    date: date("date").notNull(),
    categoryId: uuid("category_id")
      .notNull()
      .references(() => expenseCategories.id, { onDelete: "restrict" }),
    description: text("description").notNull(),
    amountFils: integer("amount_fils").notNull(),
    method: paymentMethod("method").notNull(),
    vendor: text("vendor"),
    reference: text("reference"),
    createdById: uuid("created_by_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("expenses_date_idx").on(t.date), index("expenses_category_idx").on(t.categoryId)],
);

/** Money in or out that is neither a sale nor an expense: owner capital, drawings, loans, other income. */
export const cashEntries = pgTable(
  "cash_entries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    date: date("date").notNull(),
    kind: cashEntryKind("kind").notNull(),
    amountFils: integer("amount_fils").notNull(),
    method: paymentMethod("method").notNull(),
    description: text("description"),
    createdById: uuid("created_by_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("cash_entries_date_idx").on(t.date)],
);

/** Opening cash position the cash-flow statement starts from. One row, id = 1. */
export const financeSettings = pgTable("finance_settings", {
  id: integer("id").primaryKey().default(1),
  openingCashFils: integer("opening_cash_fils").notNull().default(0),
  openingDate: date("opening_date").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type ExpenseCategory = typeof expenseCategories.$inferSelect;
export type Expense = typeof expenses.$inferSelect;
export type CashEntry = typeof cashEntries.$inferSelect;
export type CashEntryKind = (typeof cashEntryKind.enumValues)[number];
export type PaymentMethod = (typeof paymentMethod.enumValues)[number];

export type CarMake = typeof carMakes.$inferSelect;
export type CarModel = typeof carModels.$inferSelect;
export type BodyType = (typeof bodyType.enumValues)[number];
export type Service = typeof services.$inferSelect;
export type Job = typeof jobs.$inferSelect;
export type JobItem = typeof jobItems.$inferSelect;
export type Invoice = typeof invoices.$inferSelect;
export type Payment = typeof payments.$inferSelect;
export type Warranty = typeof warranties.$inferSelect;

export type JobStatus = (typeof jobStatus.enumValues)[number];
export type UserRole = (typeof userRole.enumValues)[number];
export type ServiceCategory = (typeof serviceCategory.enumValues)[number];
export type InvoiceStatus = (typeof invoiceStatus.enumValues)[number];
