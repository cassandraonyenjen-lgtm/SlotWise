CREATE TYPE "public"."booking_actor" AS ENUM('host', 'invitee', 'system');--> statement-breakpoint
CREATE TYPE "public"."booking_event_type" AS ENUM('created', 'rescheduled', 'cancelled', 'marked_no_show');--> statement-breakpoint
CREATE TYPE "public"."booking_status" AS ENUM('confirmed', 'cancelled', 'no_show');--> statement-breakpoint
CREATE TYPE "public"."email_status" AS ENUM('queued', 'sent', 'delivered', 'bounced', 'complained', 'failed');--> statement-breakpoint
CREATE TYPE "public"."email_type" AS ENUM('invitee_confirmation', 'host_notification', 'reminder', 'cancellation', 'reschedule');--> statement-breakpoint
CREATE TYPE "public"."location_type" AS ENUM('in_person', 'phone', 'video_link');--> statement-breakpoint
CREATE TYPE "public"."question_type" AS ENUM('short_text', 'long_text');--> statement-breakpoint
CREATE TYPE "public"."reminder_policy" AS ENUM('off', '1h', '24h', 'both');--> statement-breakpoint
CREATE TABLE "accounts" (
	"user_id" text NOT NULL,
	"type" text NOT NULL,
	"provider" text NOT NULL,
	"provider_account_id" text NOT NULL,
	"refresh_token" text,
	"access_token" text,
	"expires_at" integer,
	"token_type" text,
	"scope" text,
	"id_token" text,
	"session_state" text,
	CONSTRAINT "accounts_provider_provider_account_id_pk" PRIMARY KEY("provider","provider_account_id")
);
--> statement-breakpoint
CREATE TABLE "availability_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"weekday" smallint NOT NULL,
	"start_time" time NOT NULL,
	"end_time" time NOT NULL,
	CONSTRAINT "availability_rules_weekday_range" CHECK ("availability_rules"."weekday" BETWEEN 0 AND 6),
	CONSTRAINT "availability_rules_start_before_end" CHECK ("availability_rules"."start_time" < "availability_rules"."end_time")
);
--> statement-breakpoint
CREATE TABLE "booking_answers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"booking_id" uuid NOT NULL,
	"question_id" uuid NOT NULL,
	"answer" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "booking_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"booking_id" uuid NOT NULL,
	"type" "booking_event_type" NOT NULL,
	"actor" "booking_actor" NOT NULL,
	"data" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bookings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"meeting_type_id" uuid NOT NULL,
	"start_at" timestamp with time zone NOT NULL,
	"end_at" timestamp with time zone NOT NULL,
	"status" "booking_status" DEFAULT 'confirmed' NOT NULL,
	"invitee_name" text NOT NULL,
	"invitee_email" text NOT NULL,
	"invitee_timezone" text NOT NULL,
	"notes" text,
	"cancel_reason" text,
	"cancelled_by" "booking_actor",
	"cancelled_at" timestamp with time zone,
	"manage_token_hash" text NOT NULL,
	"ics_uid" text NOT NULL,
	"ics_sequence" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bookings_manage_token_hash_unique" UNIQUE("manage_token_hash"),
	CONSTRAINT "bookings_ics_uid_unique" UNIQUE("ics_uid"),
	CONSTRAINT "bookings_end_after_start" CHECK ("bookings"."end_at" > "bookings"."start_at")
);
--> statement-breakpoint
CREATE TABLE "custom_questions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"meeting_type_id" uuid NOT NULL,
	"label" text NOT NULL,
	"type" "question_type" DEFAULT 'short_text' NOT NULL,
	"required" boolean DEFAULT false NOT NULL,
	"position" smallint NOT NULL,
	CONSTRAINT "custom_questions_position_range" CHECK ("custom_questions"."position" BETWEEN 0 AND 2)
);
--> statement-breakpoint
CREATE TABLE "date_overrides" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"date" date NOT NULL,
	"start_time" time,
	"end_time" time,
	"is_unavailable" boolean DEFAULT false NOT NULL,
	CONSTRAINT "date_overrides_shape" CHECK (("date_overrides"."is_unavailable" AND "date_overrides"."start_time" IS NULL AND "date_overrides"."end_time" IS NULL)
        OR (NOT "date_overrides"."is_unavailable" AND "date_overrides"."start_time" IS NOT NULL AND "date_overrides"."end_time" IS NOT NULL AND "date_overrides"."start_time" < "date_overrides"."end_time"))
);
--> statement-breakpoint
CREATE TABLE "email_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"booking_id" uuid NOT NULL,
	"type" "email_type" NOT NULL,
	"recipient" text NOT NULL,
	"idempotency_key" text NOT NULL,
	"provider_id" text,
	"status" "email_status" DEFAULT 'queued' NOT NULL,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "email_log_idempotency_key_unique" UNIQUE("idempotency_key")
);
--> statement-breakpoint
CREATE TABLE "meeting_types" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"duration_min" integer NOT NULL,
	"description" text,
	"location_type" "location_type" NOT NULL,
	"location_value" text,
	"buffer_before_min" integer DEFAULT 0 NOT NULL,
	"buffer_after_min" integer DEFAULT 0 NOT NULL,
	"min_notice_min" integer DEFAULT 240 NOT NULL,
	"max_days_ahead" integer DEFAULT 60 NOT NULL,
	"daily_limit" integer,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "meeting_types_duration_range" CHECK ("meeting_types"."duration_min" BETWEEN 15 AND 240),
	CONSTRAINT "meeting_types_buffer_before" CHECK ("meeting_types"."buffer_before_min" IN (0, 5, 10, 15, 30)),
	CONSTRAINT "meeting_types_buffer_after" CHECK ("meeting_types"."buffer_after_min" IN (0, 5, 10, 15, 30)),
	CONSTRAINT "meeting_types_min_notice_nonneg" CHECK ("meeting_types"."min_notice_min" >= 0),
	CONSTRAINT "meeting_types_max_days_positive" CHECK ("meeting_types"."max_days_ahead" > 0),
	CONSTRAINT "meeting_types_daily_limit_positive" CHECK ("meeting_types"."daily_limit" IS NULL OR "meeting_types"."daily_limit" > 0)
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"session_token" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"expires" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text,
	"email" text NOT NULL,
	"email_verified" timestamp with time zone,
	"image" text,
	"username" text,
	"timezone" text DEFAULT 'UTC' NOT NULL,
	"logo_url" text,
	"reminder_policy" "reminder_policy" DEFAULT '24h' NOT NULL,
	"cancel_cutoff_min" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email"),
	CONSTRAINT "users_username_unique" UNIQUE("username"),
	CONSTRAINT "users_username_format" CHECK ("users"."username" ~ '^[a-z0-9](?:[a-z0-9-]{1,30}[a-z0-9])$'),
	CONSTRAINT "users_cancel_cutoff_nonneg" CHECK ("users"."cancel_cutoff_min" >= 0)
);
--> statement-breakpoint
CREATE TABLE "verification_tokens" (
	"identifier" text NOT NULL,
	"token" text NOT NULL,
	"expires" timestamp with time zone NOT NULL,
	CONSTRAINT "verification_tokens_identifier_token_pk" PRIMARY KEY("identifier","token")
);
--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "availability_rules" ADD CONSTRAINT "availability_rules_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_answers" ADD CONSTRAINT "booking_answers_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_answers" ADD CONSTRAINT "booking_answers_question_id_custom_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."custom_questions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_events" ADD CONSTRAINT "booking_events_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_meeting_type_id_meeting_types_id_fk" FOREIGN KEY ("meeting_type_id") REFERENCES "public"."meeting_types"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "custom_questions" ADD CONSTRAINT "custom_questions_meeting_type_id_meeting_types_id_fk" FOREIGN KEY ("meeting_type_id") REFERENCES "public"."meeting_types"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "date_overrides" ADD CONSTRAINT "date_overrides_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_log" ADD CONSTRAINT "email_log_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meeting_types" ADD CONSTRAINT "meeting_types_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "availability_rules_user_weekday_idx" ON "availability_rules" USING btree ("user_id","weekday");--> statement-breakpoint
CREATE UNIQUE INDEX "booking_answers_booking_question_idx" ON "booking_answers" USING btree ("booking_id","question_id");--> statement-breakpoint
CREATE INDEX "booking_events_booking_idx" ON "booking_events" USING btree ("booking_id","created_at");--> statement-breakpoint
CREATE INDEX "bookings_user_start_idx" ON "bookings" USING btree ("user_id","start_at");--> statement-breakpoint
CREATE UNIQUE INDEX "custom_questions_type_position_idx" ON "custom_questions" USING btree ("meeting_type_id","position");--> statement-breakpoint
CREATE INDEX "date_overrides_user_date_idx" ON "date_overrides" USING btree ("user_id","date");--> statement-breakpoint
CREATE INDEX "email_log_booking_idx" ON "email_log" USING btree ("booking_id");--> statement-breakpoint
CREATE UNIQUE INDEX "meeting_types_user_slug_idx" ON "meeting_types" USING btree ("user_id","slug");