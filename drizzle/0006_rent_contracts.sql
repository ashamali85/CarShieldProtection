ALTER TYPE "public"."cash_entry_kind" ADD VALUE 'deposit_paid';--> statement-breakpoint
ALTER TYPE "public"."cash_entry_kind" ADD VALUE 'deposit_refund';--> statement-breakpoint
CREATE TABLE "recurring_cost_rates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"contract_id" uuid NOT NULL,
	"effective_from" date NOT NULL,
	"monthly_fils" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "recurring_costs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"category_id" uuid NOT NULL,
	"vendor" text,
	"start_date" date NOT NULL,
	"end_date" date,
	"due_day" integer DEFAULT 1 NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "expenses" ADD COLUMN "contract_id" uuid;--> statement-breakpoint
ALTER TABLE "expenses" ADD COLUMN "period_from" date;--> statement-breakpoint
ALTER TABLE "expenses" ADD COLUMN "period_to" date;--> statement-breakpoint
ALTER TABLE "recurring_cost_rates" ADD CONSTRAINT "recurring_cost_rates_contract_id_recurring_costs_id_fk" FOREIGN KEY ("contract_id") REFERENCES "public"."recurring_costs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_costs" ADD CONSTRAINT "recurring_costs_category_id_expense_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."expense_categories"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "recurring_cost_rates_contract_from_idx" ON "recurring_cost_rates" USING btree ("contract_id","effective_from");--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_contract_id_recurring_costs_id_fk" FOREIGN KEY ("contract_id") REFERENCES "public"."recurring_costs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "expenses_contract_idx" ON "expenses" USING btree ("contract_id");