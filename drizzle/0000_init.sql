CREATE TYPE "public"."day_type" AS ENUM('green', 'gold', 'a_day', 'b_day', 'c_day', 'no_school');--> statement-breakpoint
CREATE TYPE "public"."division_code" AS ENUM('US', 'MS', 'LS');--> statement-breakpoint
CREATE TYPE "public"."flag_type" AS ENUM('no_grade_match', 'no_gender_match', 'host_over_cap', 'uncovered_interest', 'excess_free_periods', 'no_availability');--> statement-breakpoint
CREATE TYPE "public"."gender" AS ENUM('M', 'F');--> statement-breakpoint
CREATE TYPE "public"."import_kind" AS ENUM('host_schedule', 'prospective', 'course_catalog', 'us_schedule_pdf');--> statement-breakpoint
CREATE TYPE "public"."interest_category" AS ENUM('academic', 'non_academic');--> statement-breakpoint
CREATE TYPE "public"."match_status" AS ENUM('proposed', 'confirmed', 'sent', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."meeting_kind" AS ENUM('faculty_meeting', 'admissions_interview');--> statement-breakpoint
CREATE TYPE "public"."rotation_kind" AS ENUM('eight_day', 'weekly_fixed');--> statement-breakpoint
CREATE TYPE "public"."staff_kind" AS ENUM('faculty', 'admissions');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('student', 'admin');--> statement-breakpoint
CREATE TABLE "academic_days" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"academic_year_id" uuid NOT NULL,
	"date" date NOT NULL,
	"day_type" "day_type" NOT NULL,
	"day_number" integer,
	"notes" text
);
--> statement-breakpoint
CREATE TABLE "academic_years" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"division_id" uuid NOT NULL,
	"label" text NOT NULL,
	"rotation_kind" "rotation_kind" NOT NULL,
	"start_date" date,
	"start_day_type" "day_type",
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app_settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "block_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"division_id" uuid NOT NULL,
	"day_type" "day_type" NOT NULL,
	"day_number" integer,
	"label" text NOT NULL,
	"start_time" time NOT NULL,
	"end_time" time NOT NULL,
	"sort_order" integer NOT NULL,
	"is_academic" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "divisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" "division_code" NOT NULL,
	"label" text NOT NULL,
	CONSTRAINT "divisions_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "faculty_interests" (
	"staff_id" uuid NOT NULL,
	"interest_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "host_schedule_blocks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"schedule_day_id" uuid NOT NULL,
	"block_label" text NOT NULL,
	"course_title" text,
	"course_code" text,
	"start_time" time NOT NULL,
	"end_time" time NOT NULL,
	"room" text,
	"teacher" text,
	"is_academic" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "host_schedule_days" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"host_student_id" uuid NOT NULL,
	"date" date NOT NULL,
	"day_type" "day_type",
	"source_file_name" text,
	"import_batch_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "host_student_interests" (
	"host_student_id" uuid NOT NULL,
	"interest_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "host_students" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"profile_id" uuid,
	"external_id" text,
	"full_name" text NOT NULL,
	"grad_year" integer,
	"grade" integer,
	"gender" "gender",
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "import_batches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" "import_kind" NOT NULL,
	"file_name" text,
	"row_count" integer,
	"notes" text,
	"uploaded_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "interests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"category" "interest_category" NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "match_flags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"prospective_id" uuid,
	"match_id" uuid,
	"type" "flag_type" NOT NULL,
	"message" text NOT NULL,
	"resolved" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "match_meetings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"match_id" uuid NOT NULL,
	"kind" "meeting_kind" NOT NULL,
	"staff_id" uuid,
	"interest_id" uuid,
	"start_time" time,
	"end_time" time,
	"block_label" text,
	"notes" text
);
--> statement-breakpoint
CREATE TABLE "matches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"prospective_id" uuid NOT NULL,
	"host_student_id" uuid,
	"shadow_date" date NOT NULL,
	"day_type" "day_type",
	"status" "match_status" DEFAULT 'proposed' NOT NULL,
	"score" integer,
	"free_period_count" integer,
	"notes" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "profiles" (
	"id" uuid PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"full_name" text,
	"role" "user_role" DEFAULT 'student' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "profiles_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "prospective_interests" (
	"prospective_id" uuid NOT NULL,
	"interest_id" uuid NOT NULL,
	"priority" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "prospective_students" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"external_id" text,
	"full_name" text NOT NULL,
	"grade" integer,
	"gender" "gender",
	"current_school" text,
	"shadow_date" date,
	"wants_shadow" boolean DEFAULT false NOT NULL,
	"schedule_choice" text,
	"interview_date" date,
	"interview_start" time,
	"interview_end" time,
	"additional_info" text,
	"family_email" text,
	"counselor_staff_id" uuid,
	"counselor_name_raw" text,
	"import_batch_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "staff" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" "staff_kind" NOT NULL,
	"full_name" text NOT NULL,
	"email" text,
	"calendar_feed_url" text,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "staff_availability" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"staff_id" uuid NOT NULL,
	"date" date NOT NULL,
	"start_time" time NOT NULL,
	"end_time" time NOT NULL,
	"is_free" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
ALTER TABLE "academic_days" ADD CONSTRAINT "academic_days_academic_year_id_academic_years_id_fk" FOREIGN KEY ("academic_year_id") REFERENCES "public"."academic_years"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "academic_years" ADD CONSTRAINT "academic_years_division_id_divisions_id_fk" FOREIGN KEY ("division_id") REFERENCES "public"."divisions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "block_templates" ADD CONSTRAINT "block_templates_division_id_divisions_id_fk" FOREIGN KEY ("division_id") REFERENCES "public"."divisions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "faculty_interests" ADD CONSTRAINT "faculty_interests_staff_id_staff_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."staff"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "faculty_interests" ADD CONSTRAINT "faculty_interests_interest_id_interests_id_fk" FOREIGN KEY ("interest_id") REFERENCES "public"."interests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "host_schedule_blocks" ADD CONSTRAINT "host_schedule_blocks_schedule_day_id_host_schedule_days_id_fk" FOREIGN KEY ("schedule_day_id") REFERENCES "public"."host_schedule_days"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "host_schedule_days" ADD CONSTRAINT "host_schedule_days_host_student_id_host_students_id_fk" FOREIGN KEY ("host_student_id") REFERENCES "public"."host_students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "host_schedule_days" ADD CONSTRAINT "host_schedule_days_import_batch_id_import_batches_id_fk" FOREIGN KEY ("import_batch_id") REFERENCES "public"."import_batches"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "host_student_interests" ADD CONSTRAINT "host_student_interests_host_student_id_host_students_id_fk" FOREIGN KEY ("host_student_id") REFERENCES "public"."host_students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "host_student_interests" ADD CONSTRAINT "host_student_interests_interest_id_interests_id_fk" FOREIGN KEY ("interest_id") REFERENCES "public"."interests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "host_students" ADD CONSTRAINT "host_students_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_batches" ADD CONSTRAINT "import_batches_uploaded_by_profiles_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_flags" ADD CONSTRAINT "match_flags_prospective_id_prospective_students_id_fk" FOREIGN KEY ("prospective_id") REFERENCES "public"."prospective_students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_flags" ADD CONSTRAINT "match_flags_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_meetings" ADD CONSTRAINT "match_meetings_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_meetings" ADD CONSTRAINT "match_meetings_staff_id_staff_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."staff"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_meetings" ADD CONSTRAINT "match_meetings_interest_id_interests_id_fk" FOREIGN KEY ("interest_id") REFERENCES "public"."interests"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_prospective_id_prospective_students_id_fk" FOREIGN KEY ("prospective_id") REFERENCES "public"."prospective_students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_host_student_id_host_students_id_fk" FOREIGN KEY ("host_student_id") REFERENCES "public"."host_students"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_created_by_profiles_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prospective_interests" ADD CONSTRAINT "prospective_interests_prospective_id_prospective_students_id_fk" FOREIGN KEY ("prospective_id") REFERENCES "public"."prospective_students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prospective_interests" ADD CONSTRAINT "prospective_interests_interest_id_interests_id_fk" FOREIGN KEY ("interest_id") REFERENCES "public"."interests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prospective_students" ADD CONSTRAINT "prospective_students_counselor_staff_id_staff_id_fk" FOREIGN KEY ("counselor_staff_id") REFERENCES "public"."staff"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prospective_students" ADD CONSTRAINT "prospective_students_import_batch_id_import_batches_id_fk" FOREIGN KEY ("import_batch_id") REFERENCES "public"."import_batches"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_availability" ADD CONSTRAINT "staff_availability_staff_id_staff_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."staff"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "academic_days_year_date_idx" ON "academic_days" USING btree ("academic_year_id","date");--> statement-breakpoint
CREATE UNIQUE INDEX "block_templates_div_daytype_daynum_label_idx" ON "block_templates" USING btree ("division_id","day_type","day_number","label");--> statement-breakpoint
CREATE UNIQUE INDEX "faculty_interest_idx" ON "faculty_interests" USING btree ("staff_id","interest_id");--> statement-breakpoint
CREATE INDEX "host_schedule_blocks_day_idx" ON "host_schedule_blocks" USING btree ("schedule_day_id");--> statement-breakpoint
CREATE UNIQUE INDEX "host_schedule_day_idx" ON "host_schedule_days" USING btree ("host_student_id","date");--> statement-breakpoint
CREATE UNIQUE INDEX "host_interest_idx" ON "host_student_interests" USING btree ("host_student_id","interest_id");--> statement-breakpoint
CREATE UNIQUE INDEX "host_students_profile_idx" ON "host_students" USING btree ("profile_id");--> statement-breakpoint
CREATE INDEX "host_students_grade_gender_idx" ON "host_students" USING btree ("grade","gender");--> statement-breakpoint
CREATE UNIQUE INDEX "interests_name_idx" ON "interests" USING btree ("name");--> statement-breakpoint
CREATE INDEX "match_flags_prospective_idx" ON "match_flags" USING btree ("prospective_id");--> statement-breakpoint
CREATE INDEX "match_meetings_match_idx" ON "match_meetings" USING btree ("match_id");--> statement-breakpoint
CREATE INDEX "matches_prospective_idx" ON "matches" USING btree ("prospective_id");--> statement-breakpoint
CREATE INDEX "matches_host_idx" ON "matches" USING btree ("host_student_id");--> statement-breakpoint
CREATE INDEX "matches_date_idx" ON "matches" USING btree ("shadow_date");--> statement-breakpoint
CREATE UNIQUE INDEX "prospective_interest_idx" ON "prospective_interests" USING btree ("prospective_id","interest_id");--> statement-breakpoint
CREATE UNIQUE INDEX "prospective_priority_idx" ON "prospective_interests" USING btree ("prospective_id","priority");--> statement-breakpoint
CREATE INDEX "prospective_grade_gender_idx" ON "prospective_students" USING btree ("grade","gender");--> statement-breakpoint
CREATE INDEX "staff_kind_idx" ON "staff" USING btree ("kind");--> statement-breakpoint
CREATE INDEX "staff_availability_idx" ON "staff_availability" USING btree ("staff_id","date");