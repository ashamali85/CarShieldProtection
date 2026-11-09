ALTER TABLE "invoices" ADD COLUMN "discount_percent_bp" integer;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "discount_percent_bp" integer;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "qc_checks" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "qc_checked_by" uuid;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "qc_checked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_qc_checked_by_users_id_fk" FOREIGN KEY ("qc_checked_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;