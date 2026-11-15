ALTER TABLE "invoices" ADD COLUMN "share_token" text;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_share_token_unique" UNIQUE("share_token");--> statement-breakpoint
UPDATE "invoices" SET "share_token" = replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '') WHERE "share_token" IS NULL;
