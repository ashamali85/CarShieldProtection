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
export type PaymentMethod = (typeof paymentMethod.enumValues)[number];
export type InvoiceStatus = (typeof invoiceStatus.enumValues)[number];
