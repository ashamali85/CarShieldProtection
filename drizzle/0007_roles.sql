CREATE TABLE "roles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"name_en" text NOT NULL,
	"name_ar" text NOT NULL,
	"permissions" text[] DEFAULT '{}'::text[] NOT NULL,
	"system" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "roles_key_unique" UNIQUE("key")
);
--> statement-breakpoint
INSERT INTO "roles" ("key", "name_en", "name_ar", "permissions", "system") VALUES
('admin', 'Admin', 'مدير', '{jobs.view,jobs.manage,customers.view,customers.manage,warranties.view,invoices.view,invoices.manage,inventory.view,inventory.receive,inventory.manage,services.view,services.manage,catalog.manage,finance.view,finance.manage,hr.view,hr.manage,users.manage,roles.manage}', true),
('staff', 'Front desk', 'الاستقبال', '{jobs.view,jobs.manage,customers.view,customers.manage,warranties.view,invoices.view,invoices.manage,inventory.view,inventory.receive,services.view}', false),
('technician', 'Technician', 'فني', '{jobs.view,jobs.manage,customers.view,customers.manage,warranties.view,invoices.view,invoices.manage,inventory.view,inventory.receive,services.view}', false)
ON CONFLICT ("key") DO NOTHING;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "role_id" uuid;--> statement-breakpoint
UPDATE "users" u SET "role_id" = r."id" FROM "roles" r WHERE r."key" = u."role"::text AND u."role_id" IS NULL;--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "role_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE restrict ON UPDATE no action;