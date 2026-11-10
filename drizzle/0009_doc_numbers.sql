CREATE TABLE "doc_counters" (
	"kind" text NOT NULL,
	"year" integer NOT NULL,
	"last" integer NOT NULL,
	CONSTRAINT "doc_counters_kind_year_pk" PRIMARY KEY("kind","year")
);
--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "code" text;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "code" text;--> statement-breakpoint
ALTER TABLE "warranties" ADD COLUMN "legacy_code" text;--> statement-breakpoint
UPDATE "jobs" SET "code" = 'JB-' || extract(year from "created_at" at time zone 'Asia/Kuwait')::int || '-' || CASE WHEN "number" > 9999 THEN "number"::text ELSE lpad("number"::text, 4, '0') END WHERE "code" IS NULL;--> statement-breakpoint
UPDATE "invoices" SET "code" = 'INV-' || extract(year from "issued_at" at time zone 'Asia/Kuwait')::int || '-' || CASE WHEN "number" > 9999 THEN "number"::text ELSE lpad("number"::text, 4, '0') END WHERE "code" IS NULL;--> statement-breakpoint
UPDATE "warranties" w SET "legacy_code" = w."code", "code" = 'WR-' || r.y || '-' || CASE WHEN r.n > 9999 THEN r.n::text ELSE lpad(r.n::text, 4, '0') END
FROM (
  SELECT "id", extract(year from "created_at" at time zone 'Asia/Kuwait')::int AS y,
    row_number() OVER (PARTITION BY extract(year from "created_at" at time zone 'Asia/Kuwait') ORDER BY "created_at", "code") AS n
  FROM "warranties" WHERE "legacy_code" IS NULL AND "code" NOT LIKE 'WR-%'
) r
WHERE w."id" = r."id";--> statement-breakpoint
INSERT INTO "doc_counters" ("kind", "year", "last")
SELECT 'job', extract(year from "created_at" at time zone 'Asia/Kuwait')::int, max("number") FROM "jobs" GROUP BY 2
UNION ALL
SELECT 'invoice', extract(year from "issued_at" at time zone 'Asia/Kuwait')::int, max("number") FROM "invoices" GROUP BY 2
UNION ALL
SELECT 'warranty', extract(year from "created_at" at time zone 'Asia/Kuwait')::int, count(*) FROM "warranties" GROUP BY 2
ON CONFLICT ("kind", "year") DO UPDATE SET "last" = greatest("doc_counters"."last", excluded."last");--> statement-breakpoint
ALTER TABLE "invoices" ALTER COLUMN "code" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "jobs" ALTER COLUMN "code" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_code_unique" UNIQUE("code");--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_code_unique" UNIQUE("code");
