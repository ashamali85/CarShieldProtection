CREATE TYPE "public"."inventory_unit" AS ENUM('piece', 'roll', 'meter', 'sqm', 'ml', 'liter', 'box', 'pack');--> statement-breakpoint
CREATE TYPE "public"."movement_reason" AS ENUM('job', 'job_reversal', 'restock', 'adjustment');--> statement-breakpoint
CREATE TABLE "inventory_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name_en" text NOT NULL,
	"name_ar" text NOT NULL,
	"sku" text,
	"unit" "inventory_unit" DEFAULT 'piece' NOT NULL,
	"on_hand_milli" integer DEFAULT 0 NOT NULL,
	"reorder_level_milli" integer DEFAULT 0 NOT NULL,
	"unit_cost_fils" integer,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inventory_movements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"item_id" uuid NOT NULL,
	"delta_milli" integer NOT NULL,
	"reason" "movement_reason" NOT NULL,
	"job_id" uuid,
	"job_item_id" uuid,
	"note" text,
	"user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "service_materials" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"service_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"quantity_milli" integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_item_id_inventory_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."inventory_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_job_item_id_job_items_id_fk" FOREIGN KEY ("job_item_id") REFERENCES "public"."job_items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_materials" ADD CONSTRAINT "service_materials_service_id_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_materials" ADD CONSTRAINT "service_materials_item_id_inventory_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."inventory_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "inventory_movements_item_idx" ON "inventory_movements" USING btree ("item_id");--> statement-breakpoint
CREATE INDEX "inventory_movements_job_idx" ON "inventory_movements" USING btree ("job_id");--> statement-breakpoint
CREATE UNIQUE INDEX "service_materials_service_item_uq" ON "service_materials" USING btree ("service_id","item_id");