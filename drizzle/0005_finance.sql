CREATE TYPE "public"."cash_entry_kind" AS ENUM('capital_in', 'owner_drawing', 'loan_received', 'loan_repayment', 'other_income');--> statement-breakpoint
CREATE TYPE "public"."expense_kind" AS ENUM('operating', 'asset');--> statement-breakpoint
CREATE TABLE "cash_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"date" date NOT NULL,
	"kind" "cash_entry_kind" NOT NULL,
	"amount_fils" integer NOT NULL,
	"method" "payment_method" NOT NULL,
	"description" text,
	"created_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "expense_categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name_en" text NOT NULL,
	"name_ar" text NOT NULL,
	"kind" "expense_kind" DEFAULT 'operating' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "expense_categories_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "expenses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"date" date NOT NULL,
	"category_id" uuid NOT NULL,
	"description" text NOT NULL,
	"amount_fils" integer NOT NULL,
	"method" "payment_method" NOT NULL,
	"vendor" text,
	"reference" text,
	"created_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "finance_settings" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"opening_cash_fils" integer DEFAULT 0 NOT NULL,
	"opening_date" date NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "inventory_movements" ADD COLUMN "unit_cost_fils" integer;--> statement-breakpoint
ALTER TABLE "inventory_movements" ADD COLUMN "supplier" text;--> statement-breakpoint
ALTER TABLE "inventory_movements" ADD COLUMN "paid_with" "payment_method";--> statement-breakpoint
ALTER TABLE "cash_entries" ADD CONSTRAINT "cash_entries_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_category_id_expense_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."expense_categories"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "cash_entries_date_idx" ON "cash_entries" USING btree ("date");--> statement-breakpoint
CREATE INDEX "expenses_date_idx" ON "expenses" USING btree ("date");--> statement-breakpoint
CREATE INDEX "expenses_category_idx" ON "expenses" USING btree ("category_id");--> statement-breakpoint
INSERT INTO "expense_categories" ("code", "name_en", "name_ar", "kind", "sort_order") VALUES
('rent', 'Rent', 'الإيجار', 'operating', 1),
('utilities', 'Electricity & water', 'الكهرباء والماء', 'operating', 2),
('telecom', 'Phone & internet', 'الهاتف والإنترنت', 'operating', 3),
('supplies', 'Workshop supplies', 'مستلزمات الورشة', 'operating', 4),
('maintenance', 'Repairs & maintenance', 'الصيانة والإصلاحات', 'operating', 5),
('marketing', 'Marketing & advertising', 'التسويق والإعلان', 'operating', 6),
('fuel', 'Fuel & transport', 'الوقود والمواصلات', 'operating', 7),
('government', 'Government fees & licences', 'الرسوم الحكومية والتراخيص', 'operating', 8),
('insurance', 'Insurance', 'التأمين', 'operating', 9),
('professional', 'Accounting & legal fees', 'أتعاب المحاسبة والاستشارات', 'operating', 10),
('bank', 'Bank & card charges', 'الرسوم البنكية وعمولات البطاقات', 'operating', 11),
('staff_other', 'Staff costs (non-payroll)', 'تكاليف الموظفين الأخرى', 'operating', 12),
('other', 'Other expenses', 'مصروفات أخرى', 'operating', 13),
('equipment', 'Equipment & tools (asset)', 'المعدات والأدوات (أصول)', 'asset', 14)
ON CONFLICT ("code") DO NOTHING;
--> statement-breakpoint
INSERT INTO "finance_settings" ("id", "opening_cash_fils", "opening_date") VALUES (1, 0, '2026-01-01') ON CONFLICT DO NOTHING;
--> statement-breakpoint
UPDATE "inventory_movements" m SET "unit_cost_fils" = i."unit_cost_fils" FROM "inventory_items" i WHERE m."item_id" = i."id" AND m."unit_cost_fils" IS NULL AND i."unit_cost_fils" IS NOT NULL;
