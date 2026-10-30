CREATE TYPE "public"."body_type" AS ENUM('sedan', 'hatchback', 'coupe', 'convertible', 'suv', 'pickup', 'van', 'minivan', 'wagon');--> statement-breakpoint
CREATE TABLE "car_makes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"name_ar" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "car_makes_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "car_models" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"make_id" uuid NOT NULL,
	"name" text NOT NULL,
	"body_type" "body_type" NOT NULL,
	"year_from" integer NOT NULL,
	"year_to" integer,
	"active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
ALTER TABLE "vehicles" ADD COLUMN "model_id" uuid;--> statement-breakpoint
ALTER TABLE "vehicles" ADD COLUMN "body_type" "body_type";--> statement-breakpoint
ALTER TABLE "car_models" ADD CONSTRAINT "car_models_make_id_car_makes_id_fk" FOREIGN KEY ("make_id") REFERENCES "public"."car_makes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "car_models_make_name_body_uq" ON "car_models" USING btree ("make_id","name","body_type");--> statement-breakpoint
CREATE INDEX "car_models_make_idx" ON "car_models" USING btree ("make_id");--> statement-breakpoint
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_model_id_car_models_id_fk" FOREIGN KEY ("model_id") REFERENCES "public"."car_models"("id") ON DELETE set null ON UPDATE no action;