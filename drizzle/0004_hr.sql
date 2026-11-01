CREATE TYPE "public"."contract_type" AS ENUM('unlimited', 'fixed');--> statement-breakpoint
CREATE TYPE "public"."employee_status" AS ENUM('active', 'terminated');--> statement-breakpoint
CREATE TYPE "public"."gender" AS ENUM('male', 'female');--> statement-breakpoint
CREATE TYPE "public"."leave_status" AS ENUM('pending', 'approved', 'rejected', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."payroll_status" AS ENUM('draft', 'approved', 'paid');--> statement-breakpoint
CREATE TYPE "public"."separation_reason" AS ENUM('resignation', 'termination', 'contract_end', 'retirement', 'death', 'other');--> statement-breakpoint
CREATE TABLE "employees" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" serial NOT NULL,
	"user_id" uuid,
	"full_name" text NOT NULL,
	"full_name_ar" text,
	"gender" "gender" DEFAULT 'male' NOT NULL,
	"nationality" text NOT NULL,
	"is_kuwaiti" boolean DEFAULT false NOT NULL,
	"date_of_birth" date,
	"phone" text,
	"email" text,
	"job_title" text NOT NULL,
	"department" text,
	"hire_date" date NOT NULL,
	"contract_type" "contract_type" DEFAULT 'unlimited' NOT NULL,
	"contract_end" date,
	"civil_id" text,
	"civil_id_expiry" date,
	"passport_no" text,
	"passport_expiry" date,
	"residency_expiry" date,
	"basic_salary_fils" integer NOT NULL,
	"housing_allowance_fils" integer DEFAULT 0 NOT NULL,
	"transport_allowance_fils" integer DEFAULT 0 NOT NULL,
	"other_allowance_fils" integer DEFAULT 0 NOT NULL,
	"pifss_salary_fils" integer,
	"leave_opening_days" integer DEFAULT 0 NOT NULL,
	"bank_name" text,
	"iban" text,
	"status" "employee_status" DEFAULT 'active' NOT NULL,
	"end_date" date,
	"separation_reason" "separation_reason",
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "employees_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "hr_settings" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"settings" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "leave_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"employee_id" uuid NOT NULL,
	"leave_type_id" uuid NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"days" integer NOT NULL,
	"status" "leave_status" DEFAULT 'approved' NOT NULL,
	"pay_breakdown" jsonb,
	"unpaid_centi_days" integer DEFAULT 0 NOT NULL,
	"reason" text,
	"decided_by_id" uuid,
	"decided_at" timestamp with time zone,
	"created_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "leave_types" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name_en" text NOT NULL,
	"name_ar" text NOT NULL,
	"allowance_days" integer,
	"period" text DEFAULT 'year' NOT NULL,
	"pay_tiers" jsonb NOT NULL,
	"min_service_months" integer DEFAULT 0 NOT NULL,
	"female_only" boolean DEFAULT false NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "leave_types_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "payroll_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"year" integer NOT NULL,
	"month" integer NOT NULL,
	"status" "payroll_status" DEFAULT 'draft' NOT NULL,
	"notes" text,
	"created_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"approved_at" timestamp with time zone,
	"paid_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "payslips" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" uuid NOT NULL,
	"employee_id" uuid NOT NULL,
	"employee_name" text NOT NULL,
	"job_title" text NOT NULL,
	"is_kuwaiti" boolean NOT NULL,
	"iban" text,
	"bank_name" text,
	"days_employed" integer NOT NULL,
	"days_in_month" integer NOT NULL,
	"basic_fils" integer NOT NULL,
	"housing_fils" integer NOT NULL,
	"transport_fils" integer NOT NULL,
	"other_allowance_fils" integer NOT NULL,
	"overtime_normal_centi_hours" integer DEFAULT 0 NOT NULL,
	"overtime_rest_centi_hours" integer DEFAULT 0 NOT NULL,
	"overtime_holiday_centi_hours" integer DEFAULT 0 NOT NULL,
	"overtime_fils" integer DEFAULT 0 NOT NULL,
	"bonus_fils" integer DEFAULT 0 NOT NULL,
	"unpaid_leave_centi_days" integer DEFAULT 0 NOT NULL,
	"unpaid_leave_fils" integer DEFAULT 0 NOT NULL,
	"absence_days" integer DEFAULT 0 NOT NULL,
	"absence_fils" integer DEFAULT 0 NOT NULL,
	"other_deduction_fils" integer DEFAULT 0 NOT NULL,
	"pifss_employee_fils" integer DEFAULT 0 NOT NULL,
	"pifss_employer_fils" integer DEFAULT 0 NOT NULL,
	"gross_fils" integer NOT NULL,
	"deductions_fils" integer NOT NULL,
	"net_fils" integer NOT NULL,
	"note" text
);
--> statement-breakpoint
ALTER TABLE "employees" ADD CONSTRAINT "employees_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_leave_type_id_leave_types_id_fk" FOREIGN KEY ("leave_type_id") REFERENCES "public"."leave_types"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_decided_by_id_users_id_fk" FOREIGN KEY ("decided_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_runs" ADD CONSTRAINT "payroll_runs_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payslips" ADD CONSTRAINT "payslips_run_id_payroll_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."payroll_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payslips" ADD CONSTRAINT "payslips_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "employees_status_idx" ON "employees" USING btree ("status");--> statement-breakpoint
CREATE INDEX "leave_requests_employee_idx" ON "leave_requests" USING btree ("employee_id");--> statement-breakpoint
CREATE INDEX "leave_requests_dates_idx" ON "leave_requests" USING btree ("start_date","end_date");--> statement-breakpoint
CREATE UNIQUE INDEX "payroll_runs_period_uq" ON "payroll_runs" USING btree ("year","month");--> statement-breakpoint
CREATE UNIQUE INDEX "payslips_run_employee_uq" ON "payslips" USING btree ("run_id","employee_id");--> statement-breakpoint
INSERT INTO "hr_settings" ("id", "settings") VALUES (1, '{"dailyRateDivisor":26,"hoursPerDay":8,"overtimeNormalPct":125,"overtimeRestDayPct":150,"overtimeHolidayPct":200,"pifss":{"basicCapFils":1500000,"totalCapFils":2750000,"remunerationCapFils":1500000,"employee":{"basic":5,"supplementary":5,"pensionIncrease":2.5,"unemployment":0.5,"remuneration":2.5},"employer":{"basic":10,"supplementary":10,"pensionIncrease":1,"unemployment":0.5}}}') ON CONFLICT DO NOTHING;
--> statement-breakpoint
INSERT INTO "leave_types" ("code", "name_en", "name_ar", "allowance_days", "period", "pay_tiers", "min_service_months", "female_only", "sort_order") VALUES
('annual', 'Annual leave', 'الإجازة السنوية', 30, 'accrual', '[{"days":null,"pct":100}]', 9, false, 1),
('sick', 'Sick leave', 'الإجازة المرضية', 75, 'year', '[{"days":15,"pct":100},{"days":10,"pct":75},{"days":10,"pct":50},{"days":10,"pct":25},{"days":30,"pct":0}]', 0, false, 2),
('maternity', 'Maternity leave', 'إجازة الوضع', 70, 'event', '[{"days":70,"pct":100}]', 0, true, 3),
('hajj', 'Hajj leave', 'إجازة الحج', 21, 'service', '[{"days":21,"pct":100}]', 24, false, 4),
('bereavement', 'Bereavement leave', 'إجازة الوفاة', 3, 'event', '[{"days":3,"pct":100}]', 0, false, 5),
('iddah', 'Iddah leave', 'إجازة العدة', 130, 'event', '[{"days":130,"pct":100}]', 0, true, 6),
('unpaid', 'Unpaid leave', 'إجازة بدون راتب', NULL, 'year', '[{"days":null,"pct":0}]', 0, false, 7)
ON CONFLICT ("code") DO NOTHING;
