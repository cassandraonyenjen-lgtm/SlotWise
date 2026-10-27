/**
 * Slotwise database schema (PRD §7 "High-level data model").
 *
 * Time handling rules (PRD §7, key decision 1):
 * - Instants (bookings) are `timestamptz`, always UTC.
 * - Availability is local wall-clock `time` + the host's IANA time zone on `users.timezone`.
 *
 * The double-booking exclusion constraint on `bookings` cannot be expressed in Drizzle's
 * table builder, so it lives in a hand-written migration: drizzle/0001_booking_exclusion.sql.
 */
import { relations, sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  smallint,
  text,
  time,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import type { AdapterAccountType } from "next-auth/adapters";

const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = () =>
  timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date());

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export const locationType = pgEnum("location_type", ["in_person", "phone", "video_link"]);
export const questionType = pgEnum("question_type", ["short_text", "long_text"]);
/** Reschedules update the booking in place (same ICS UID, sequence + 1), so there is no "rescheduled" status. */
export const bookingStatus = pgEnum("booking_status", ["confirmed", "cancelled", "no_show"]);
export const bookingActor = pgEnum("booking_actor", ["host", "invitee", "system"]);
export const bookingEventType = pgEnum("booking_event_type", [
  "created",
  "rescheduled",
  "cancelled",
  "marked_no_show",
]);
export const reminderPolicy = pgEnum("reminder_policy", ["off", "1h", "24h", "both"]);
export const emailType = pgEnum("email_type", [
  "invitee_confirmation",
  "host_notification",
  "reminder",
  "cancellation",
  "reschedule",
]);
export const emailStatus = pgEnum("email_status", [
  "queued",
  "sent",
  "delivered",
  "bounced",
  "complained",
  "failed",
]);

// ---------------------------------------------------------------------------
// Users + Auth.js tables (shape required by @auth/drizzle-adapter)
// ---------------------------------------------------------------------------

export const users = pgTable(
  "users",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    name: text("name"),
    email: text("email").notNull().unique(),
    emailVerified: timestamp("email_verified", { withTimezone: true, mode: "date" }),
    image: text("image"),
    /** Public slug: slotwise.app/<username>. Null until onboarding picks one. */
    username: text("username").unique(),
    /** IANA zone, e.g. "Africa/Lagos". Auto-detected at onboarding, editable. */
    timezone: text("timezone").notNull().default("UTC"),
    logoUrl: text("logo_url"),
    reminderPolicy: reminderPolicy("reminder_policy").notNull().default("24h"),
    /** Invitees can't cancel/reschedule via link within this many minutes of the start (F5.4). */
    cancelCutoffMin: integer("cancel_cutoff_min").notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    check("users_username_format", sql`${t.username} ~ '^[a-z0-9](?:[a-z0-9-]{1,30}[a-z0-9])$'`),
    check("users_cancel_cutoff_nonneg", sql`${t.cancelCutoffMin} >= 0`),
  ],
);

export const accounts = pgTable(
  "accounts",
  {
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").$type<AdapterAccountType>().notNull(),
    provider: text("provider").notNull(),
    providerAccountId: text("provider_account_id").notNull(),
    refresh_token: text("refresh_token"),
    access_token: text("access_token"),
    expires_at: integer("expires_at"),
    token_type: text("token_type"),
    scope: text("scope"),
    id_token: text("id_token"),
    session_state: text("session_state"),
  },
  (t) => [primaryKey({ columns: [t.provider, t.providerAccountId] })],
);

export const sessions = pgTable("sessions", {
  sessionToken: text("session_token").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expires: timestamp("expires", { withTimezone: true, mode: "date" }).notNull(),
});

export const verificationTokens = pgTable(
  "verification_tokens",
  {
    identifier: text("identifier").notNull(),
    token: text("token").notNull(),
    expires: timestamp("expires", { withTimezone: true, mode: "date" }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.identifier, t.token] })],
);

// ---------------------------------------------------------------------------
// F2 — Meeting types & custom questions
// ---------------------------------------------------------------------------

export const meetingTypes = pgTable(
  "meeting_types",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    durationMin: integer("duration_min").notNull(),
    description: text("description"),
    locationType: locationType("location_type").notNull(),
    locationValue: text("location_value"),
    bufferBeforeMin: integer("buffer_before_min").notNull().default(0),
    bufferAfterMin: integer("buffer_after_min").notNull().default(0),
    minNoticeMin: integer("min_notice_min").notNull().default(240),
    maxDaysAhead: integer("max_days_ahead").notNull().default(60),
    /** Null = no daily cap. */
    dailyLimit: integer("daily_limit"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("meeting_types_user_slug_idx").on(t.userId, t.slug),
    check("meeting_types_duration_range", sql`${t.durationMin} BETWEEN 15 AND 240`),
    check("meeting_types_buffer_before", sql`${t.bufferBeforeMin} IN (0, 5, 10, 15, 30)`),
    check("meeting_types_buffer_after", sql`${t.bufferAfterMin} IN (0, 5, 10, 15, 30)`),
    check("meeting_types_min_notice_nonneg", sql`${t.minNoticeMin} >= 0`),
    check("meeting_types_max_days_positive", sql`${t.maxDaysAhead} > 0`),
    check(
      "meeting_types_daily_limit_positive",
      sql`${t.dailyLimit} IS NULL OR ${t.dailyLimit} > 0`,
    ),
  ],
);

export const customQuestions = pgTable(
  "custom_questions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    meetingTypeId: uuid("meeting_type_id")
      .notNull()
      .references(() => meetingTypes.id, { onDelete: "cascade" }),
    label: text("label").notNull(),
    type: questionType("type").notNull().default("short_text"),
    required: boolean("required").notNull().default(false),
    position: smallint("position").notNull(),
  },
  (t) => [
    // At most 3 questions per meeting type (F2.5): positions 0..2, unique per type.
    uniqueIndex("custom_questions_type_position_idx").on(t.meetingTypeId, t.position),
    check("custom_questions_position_range", sql`${t.position} BETWEEN 0 AND 2`),
  ],
);

// ---------------------------------------------------------------------------
// F1 — Availability
// ---------------------------------------------------------------------------

export const availabilityRules = pgTable(
  "availability_rules",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** 0 = Sunday … 6 = Saturday (matches date-fns getDay). */
    weekday: smallint("weekday").notNull(),
    startTime: time("start_time").notNull(),
    endTime: time("end_time").notNull(),
  },
  (t) => [
    index("availability_rules_user_weekday_idx").on(t.userId, t.weekday),
    check("availability_rules_weekday_range", sql`${t.weekday} BETWEEN 0 AND 6`),
    check("availability_rules_start_before_end", sql`${t.startTime} < ${t.endTime}`),
  ],
);

/**
 * A date with is_unavailable = true blocks the whole day. Otherwise each row is one range
 * that, together with the other rows for that date, replaces the weekly hours (F1.3).
 */
export const dateOverrides = pgTable(
  "date_overrides",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    date: date("date", { mode: "string" }).notNull(),
    startTime: time("start_time"),
    endTime: time("end_time"),
    isUnavailable: boolean("is_unavailable").notNull().default(false),
  },
  (t) => [
    index("date_overrides_user_date_idx").on(t.userId, t.date),
    check(
      "date_overrides_shape",
      sql`(${t.isUnavailable} AND ${t.startTime} IS NULL AND ${t.endTime} IS NULL)
        OR (NOT ${t.isUnavailable} AND ${t.startTime} IS NOT NULL AND ${t.endTime} IS NOT NULL AND ${t.startTime} < ${t.endTime})`,
    ),
  ],
);

// ---------------------------------------------------------------------------
// F2/F5 — Bookings
// ---------------------------------------------------------------------------

export const bookings = pgTable(
  "bookings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    meetingTypeId: uuid("meeting_type_id")
      .notNull()
      .references(() => meetingTypes.id, { onDelete: "restrict" }),
    startAt: timestamp("start_at", { withTimezone: true, mode: "date" }).notNull(),
    endAt: timestamp("end_at", { withTimezone: true, mode: "date" }).notNull(),
    status: bookingStatus("status").notNull().default("confirmed"),
    inviteeName: text("invitee_name").notNull(),
    inviteeEmail: text("invitee_email").notNull(),
    inviteeTimezone: text("invitee_timezone").notNull(),
    notes: text("notes"),
    cancelReason: text("cancel_reason"),
    cancelledBy: bookingActor("cancelled_by"),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true, mode: "date" }),
    /** SHA-256 of the manage-link token; the raw token only ever lives in emails (F5.5). */
    manageTokenHash: text("manage_token_hash").notNull().unique(),
    icsUid: text("ics_uid").notNull().unique(),
    icsSequence: integer("ics_sequence").notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("bookings_user_start_idx").on(t.userId, t.startAt),
    check("bookings_end_after_start", sql`${t.endAt} > ${t.startAt}`),
    // + EXCLUDE constraint "bookings_no_overlap" in drizzle/0001_booking_exclusion.sql
  ],
);

export const bookingAnswers = pgTable(
  "booking_answers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    bookingId: uuid("booking_id")
      .notNull()
      .references(() => bookings.id, { onDelete: "cascade" }),
    questionId: uuid("question_id")
      .notNull()
      .references(() => customQuestions.id, { onDelete: "cascade" }),
    answer: text("answer").notNull(),
  },
  (t) => [uniqueIndex("booking_answers_booking_question_idx").on(t.bookingId, t.questionId)],
);

/** Audit trail backing "booking history" in the detail panel (F3.2). Not in the PRD model. */
export const bookingEvents = pgTable(
  "booking_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    bookingId: uuid("booking_id")
      .notNull()
      .references(() => bookings.id, { onDelete: "cascade" }),
    type: bookingEventType("type").notNull(),
    actor: bookingActor("actor").notNull(),
    /** e.g. { fromStartAt, toStartAt, message } */
    data: jsonb("data").$type<Record<string, unknown>>(),
    createdAt: createdAt(),
  },
  (t) => [index("booking_events_booking_idx").on(t.bookingId, t.createdAt)],
);

// ---------------------------------------------------------------------------
// F4 — Email log
// ---------------------------------------------------------------------------

export const emailLog = pgTable(
  "email_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    bookingId: uuid("booking_id")
      .notNull()
      .references(() => bookings.id, { onDelete: "cascade" }),
    type: emailType("type").notNull(),
    recipient: text("recipient").notNull(),
    /**
     * Makes sends idempotent across job retries (F4.3 "sent exactly once"),
     * e.g. `reminder:<bookingId>:<icsSequence>:24h`.
     */
    idempotencyKey: text("idempotency_key").notNull().unique(),
    providerId: text("provider_id"),
    status: emailStatus("status").notNull().default("queued"),
    sentAt: timestamp("sent_at", { withTimezone: true, mode: "date" }),
    createdAt: createdAt(),
  },
  (t) => [index("email_log_booking_idx").on(t.bookingId)],
);

// ---------------------------------------------------------------------------
// Relations (for db.query.*)
// ---------------------------------------------------------------------------

export const usersRelations = relations(users, ({ many }) => ({
  meetingTypes: many(meetingTypes),
  availabilityRules: many(availabilityRules),
  dateOverrides: many(dateOverrides),
  bookings: many(bookings),
}));

export const meetingTypesRelations = relations(meetingTypes, ({ one, many }) => ({
  user: one(users, { fields: [meetingTypes.userId], references: [users.id] }),
  questions: many(customQuestions),
  bookings: many(bookings),
}));

export const customQuestionsRelations = relations(customQuestions, ({ one }) => ({
  meetingType: one(meetingTypes, {
    fields: [customQuestions.meetingTypeId],
    references: [meetingTypes.id],
  }),
}));

export const availabilityRulesRelations = relations(availabilityRules, ({ one }) => ({
  user: one(users, { fields: [availabilityRules.userId], references: [users.id] }),
}));

export const dateOverridesRelations = relations(dateOverrides, ({ one }) => ({
  user: one(users, { fields: [dateOverrides.userId], references: [users.id] }),
}));

export const bookingsRelations = relations(bookings, ({ one, many }) => ({
  user: one(users, { fields: [bookings.userId], references: [users.id] }),
  meetingType: one(meetingTypes, {
    fields: [bookings.meetingTypeId],
    references: [meetingTypes.id],
  }),
  answers: many(bookingAnswers),
  events: many(bookingEvents),
  emails: many(emailLog),
}));

export const bookingAnswersRelations = relations(bookingAnswers, ({ one }) => ({
  booking: one(bookings, { fields: [bookingAnswers.bookingId], references: [bookings.id] }),
  question: one(customQuestions, {
    fields: [bookingAnswers.questionId],
    references: [customQuestions.id],
  }),
}));

export const bookingEventsRelations = relations(bookingEvents, ({ one }) => ({
  booking: one(bookings, { fields: [bookingEvents.bookingId], references: [bookings.id] }),
}));

export const emailLogRelations = relations(emailLog, ({ one }) => ({
  booking: one(bookings, { fields: [emailLog.bookingId], references: [bookings.id] }),
}));
