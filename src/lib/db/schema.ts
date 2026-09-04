import {
  pgTable,
  pgEnum,
  uuid,
  text,
  timestamp,
  date,
  time,
  integer,
  boolean,
  index,
  uniqueIndex,
  vector,
} from "drizzle-orm/pg-core";

// Course catalog embeddings use OpenAI text-embedding-3-small (1536 dims).
export const COURSE_EMBEDDING_DIMENSIONS = 1536;

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

// Host students log in to set interests; admissions staff run the admin portal.
export const userRole = pgEnum("user_role", ["student", "admin"]);
export const gender = pgEnum("gender", ["M", "F"]);
// interests.category is a text slug (see src/lib/interest-categories.ts):
// "academics" | "fine_arts" | "athletics" | "innovation". Text (not enum) so
// admins can recategorize without a DB migration.
export const staffKind = pgEnum("staff_kind", ["faculty", "admissions"]);

// Reused from the coverage-planner schedule model.
export const divisionCode = pgEnum("division_code", ["US", "MS", "LS"]);
export const dayType = pgEnum("day_type", [
  "green",
  "gold",
  "a_day",
  "b_day",
  "c_day",
  "no_school",
]);
export const rotationKind = pgEnum("rotation_kind", [
  "eight_day",
  "weekly_fixed",
]);

export const matchStatus = pgEnum("match_status", [
  "proposed", // engine's suggestion, not yet reviewed
  "confirmed", // admin approved
  "sent", // invites/schedule delivered
  "cancelled",
]);
export const meetingKind = pgEnum("meeting_kind", [
  "faculty_meeting", // subject meeting when a top interest isn't covered by host classes
  "admissions_interview", // ~30-min interview with assigned counselor
]);
export const flagType = pgEnum("flag_type", [
  "no_grade_match",
  "no_gender_match",
  "host_over_cap",
  "uncovered_interest",
  "excess_free_periods",
  "no_availability",
]);
export const importKind = pgEnum("import_kind", [
  "host_schedule", // one Blackbaud "Schedule for the Day" CSV per host
  "prospective", // FinalSite CSV
  "course_catalog",
  "us_schedule_pdf",
]);

// ---------------------------------------------------------------------------
// Identity
// ---------------------------------------------------------------------------

// Mirrors Supabase auth.users (id = auth user id). Both host students and
// admins get a profile; role gates the portal they see.
export const profiles = pgTable("profiles", {
  id: uuid("id").primaryKey(),
  email: text("email").notNull().unique(),
  firstName: text("first_name"),
  lastName: text("last_name"),
  fullName: text("full_name"), // kept as "First Last" for display
  role: userRole("role").notNull().default("student"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

// ---------------------------------------------------------------------------
// Interests (admin-managed, categorized)
// ---------------------------------------------------------------------------

export const interests = pgTable(
  "interests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    category: text("category").notNull(), // one of CATEGORY_SLUGS
    active: boolean("active").notNull().default(true),
    // Whether a host can self-select this interest (on /me or the admin Hosts
    // editor) — separate from `active`, which governs every other picker
    // (prospective interests, faculty interests). Academic subjects like Math
    // or Spanish stay active for those, but don't make sense as something a
    // host personally "selects" — their actual class exposure is already
    // captured via their synced schedule, not a self-declared interest.
    hostSelectable: boolean("host_selectable").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
    // Cached embedding of the interest name, computed lazily on first use in
    // matching (see src/lib/matching/loader.ts) so repeated match runs don't
    // re-call the embeddings API. Null until then, or if no OpenAI key is set.
    embedding: vector("embedding", { dimensions: COURSE_EMBEDDING_DIMENSIONS }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [uniqueIndex("interests_name_idx").on(t.name)],
);

// ---------------------------------------------------------------------------
// Course catalog (uploaded by admin, embedded for semantic interest matching)
// ---------------------------------------------------------------------------

// One row per school course. `embedding` is generated from title+description
// via OpenAI at upload time (see src/lib/llm/embeddings.ts) and compared
// against embedded interest tags to decide whether a host's scheduled class
// covers a prospective's interest — see src/lib/matching/course-map.ts.
export const courses = pgTable(
  "courses",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    code: text("code"), // catalog course code, matched against host_schedule_blocks.course_code
    title: text("title").notNull(),
    description: text("description"),
    embedding: vector("embedding", { dimensions: COURSE_EMBEDDING_DIMENSIONS }),
    importBatchId: uuid("import_batch_id").references(() => importBatches.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    index("courses_code_idx").on(t.code),
    index("courses_title_idx").on(t.title),
  ],
);

// ---------------------------------------------------------------------------
// Host students (current Greenhill students)
// ---------------------------------------------------------------------------

export const hostStudents = pgTable(
  "host_students",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // Set once the student logs in and claims their record.
    profileId: uuid("profile_id").references(() => profiles.id, {
      onDelete: "set null",
    }),
    externalId: text("external_id"), // Blackbaud id, if known
    firstName: text("first_name"),
    lastName: text("last_name"),
    fullName: text("full_name").notNull(), // "First Last" for display
    grade: integer("grade"), // e.g. 11 — grad year is redundant with this
    gender: gender("gender"),
    // Personal Outlook/Exchange "Publish a calendar" ICS feed URL — fetched
    // live wherever a schedule is needed (matching, schedule comparison, the
    // per-match printable timeline), never stored. Set by the student at /me.
    icsUrl: text("ics_url"),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    uniqueIndex("host_students_profile_idx").on(t.profileId),
    index("host_students_grade_gender_idx").on(t.grade, t.gender),
  ],
);

export const hostStudentInterests = pgTable(
  "host_student_interests",
  {
    hostStudentId: uuid("host_student_id")
      .references(() => hostStudents.id, { onDelete: "cascade" })
      .notNull(),
    interestId: uuid("interest_id")
      .references(() => interests.id, { onDelete: "cascade" })
      .notNull(),
  },
  (t) => [
    uniqueIndex("host_interest_idx").on(t.hostStudentId, t.interestId),
  ],
);

// A host's schedule for one specific date (from the Blackbaud daily CSV).
export const hostScheduleDays = pgTable(
  "host_schedule_days",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    hostStudentId: uuid("host_student_id")
      .references(() => hostStudents.id, { onDelete: "cascade" })
      .notNull(),
    date: date("date").notNull(),
    dayType: dayType("day_type"), // green/gold inferred from blocks present
    sourceFileName: text("source_file_name"),
    importBatchId: uuid("import_batch_id").references(() => importBatches.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    uniqueIndex("host_schedule_day_idx").on(t.hostStudentId, t.date),
  ],
);

export const hostScheduleBlocks = pgTable(
  "host_schedule_blocks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    scheduleDayId: uuid("schedule_day_id")
      .references(() => hostScheduleDays.id, { onDelete: "cascade" })
      .notNull(),
    blockLabel: text("block_label").notNull(), // "E Block", "Lunch", "HOH"
    courseTitle: text("course_title"),
    courseCode: text("course_code"), // "U5470-1"
    startTime: time("start_time").notNull(),
    endTime: time("end_time").notNull(),
    room: text("room"),
    teacher: text("teacher"),
    isAcademic: boolean("is_academic").notNull().default(true),
  },
  (t) => [index("host_schedule_blocks_day_idx").on(t.scheduleDayId)],
);

// ---------------------------------------------------------------------------
// Prospective students (from FinalSite CSV)
// ---------------------------------------------------------------------------

export const prospectiveStudents = pgTable(
  "prospective_students",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    externalId: text("external_id"), // FinalSite id
    firstName: text("first_name"),
    lastName: text("last_name"),
    fullName: text("full_name").notNull(), // "First Last" for display
    grade: integer("grade"),
    gender: gender("gender"),
    currentSchool: text("current_school"),
    shadowDate: date("shadow_date"),
    // The visit's scheduled time window (e.g. FinalSite bulk report rows carry
    // "7:45AM - 1:00PM" alongside the date). Distinct from interview start/end
    // below, which is a separate slot the family picks on the PDF form.
    shadowStart: time("shadow_start"),
    shadowEnd: time("shadow_end"),
    wantsShadow: boolean("wants_shadow").notNull().default(false),
    scheduleChoice: text("schedule_choice"), // "Interview Only" | "Shadow Visit/Interview" ...
    // Interview slot the family selected on the form (admin can override).
    interviewDate: date("interview_date"),
    interviewStart: time("interview_start"),
    interviewEnd: time("interview_end"),
    additionalInfo: text("additional_info"), // free-text response
    familyEmail: text("family_email"),
    // Assigned admissions interviewer (may not be a login user). TS-level
    // rename from "counselor" — SQL column names kept as-is to avoid a
    // migration; interviewer == admissions staff who conducts the interview.
    interviewerStaffId: uuid("counselor_staff_id").references(() => staff.id, {
      onDelete: "set null",
    }),
    interviewerNameRaw: text("counselor_name_raw"), // as it arrived in the CSV
    importBatchId: uuid("import_batch_id").references(() => importBatches.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [index("prospective_grade_gender_idx").on(t.grade, t.gender)],
);

// A prospective picks up to 4 interests in priority order.
export const prospectiveInterests = pgTable(
  "prospective_interests",
  {
    prospectiveId: uuid("prospective_id")
      .references(() => prospectiveStudents.id, { onDelete: "cascade" })
      .notNull(),
    interestId: uuid("interest_id")
      .references(() => interests.id, { onDelete: "cascade" })
      .notNull(),
    priority: integer("priority").notNull(), // 1 = highest
  },
  (t) => [
    uniqueIndex("prospective_interest_idx").on(t.prospectiveId, t.interestId),
    uniqueIndex("prospective_priority_idx").on(t.prospectiveId, t.priority),
  ],
);

// ---------------------------------------------------------------------------
// Staff (faculty + admissions) and faculty↔interest mapping
// ---------------------------------------------------------------------------

export const staff = pgTable(
  "staff",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    kind: staffKind("kind").notNull(),
    firstName: text("first_name"),
    lastName: text("last_name"),
    fullName: text("full_name").notNull(), // "First Last" for display
    email: text("email"),
    // Published Outlook free/busy .ics feed (per-user, no IT admin). Optional.
    calendarFeedUrl: text("calendar_feed_url"),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [index("staff_kind_idx").on(t.kind)],
);

// Multiple faculty can be assigned to one interest, and vice versa.
export const facultyInterests = pgTable(
  "faculty_interests",
  {
    staffId: uuid("staff_id")
      .references(() => staff.id, { onDelete: "cascade" })
      .notNull(),
    interestId: uuid("interest_id")
      .references(() => interests.id, { onDelete: "cascade" })
      .notNull(),
  },
  (t) => [uniqueIndex("faculty_interest_idx").on(t.staffId, t.interestId)],
);

// Recurring interview-slot template for one admissions staff member: a date
// range, which weekdays it applies to, and which 30-min blocks (8am-3pm) are
// open. Interview scheduling for prospectives is generated from these rather
// than from the interviewer's live calendar.
export const interviewerAvailability = pgTable(
  "interviewer_availability",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    staffId: uuid("staff_id")
      .references(() => staff.id, { onDelete: "cascade" })
      .notNull(),
    startDate: date("start_date").notNull(),
    endDate: date("end_date").notNull(),
    weekdays: integer("weekdays").array().notNull(), // ISO weekday: 1=Mon .. 5=Fri
    timeBlocks: text("time_blocks").array().notNull(), // 30-min block start times, "HH:MM" (e.g. "08:00")
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [index("interviewer_availability_staff_idx").on(t.staffId)],
);

// Manual free-time blocks (v1). Later replaced/augmented by polled feed busy times.
export const staffAvailability = pgTable(
  "staff_availability",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    staffId: uuid("staff_id")
      .references(() => staff.id, { onDelete: "cascade" })
      .notNull(),
    date: date("date").notNull(),
    startTime: time("start_time").notNull(),
    endTime: time("end_time").notNull(),
    isFree: boolean("is_free").notNull().default(true),
  },
  (t) => [index("staff_availability_idx").on(t.staffId, t.date)],
);

// ---------------------------------------------------------------------------
// Matches + scheduled meetings + flags
// ---------------------------------------------------------------------------

export const matches = pgTable(
  "matches",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    prospectiveId: uuid("prospective_id")
      .references(() => prospectiveStudents.id, { onDelete: "cascade" })
      .notNull(),
    hostStudentId: uuid("host_student_id").references(() => hostStudents.id, {
      onDelete: "set null",
    }),
    shadowDate: date("shadow_date").notNull(),
    dayType: dayType("day_type"),
    status: matchStatus("status").notNull().default("proposed"),
    score: integer("score"), // engine fit score, higher = better
    freePeriodCount: integer("free_period_count"),
    notes: text("notes"),
    createdBy: uuid("created_by").references(() => profiles.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    index("matches_prospective_idx").on(t.prospectiveId),
    index("matches_host_idx").on(t.hostStudentId),
    index("matches_date_idx").on(t.shadowDate),
  ],
);

// Extra items placed on the shadow day: subject meetings + the admissions interview.
export const matchMeetings = pgTable(
  "match_meetings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    matchId: uuid("match_id")
      .references(() => matches.id, { onDelete: "cascade" })
      .notNull(),
    kind: meetingKind("kind").notNull(),
    staffId: uuid("staff_id").references(() => staff.id, {
      onDelete: "set null",
    }),
    interestId: uuid("interest_id").references(() => interests.id, {
      onDelete: "set null",
    }),
    startTime: time("start_time"),
    endTime: time("end_time"),
    blockLabel: text("block_label"),
    notes: text("notes"),
  },
  (t) => [index("match_meetings_match_idx").on(t.matchId)],
);

export const matchFlags = pgTable(
  "match_flags",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // Flags can be per-prospective even before a host is assigned.
    prospectiveId: uuid("prospective_id").references(
      () => prospectiveStudents.id,
      { onDelete: "cascade" },
    ),
    matchId: uuid("match_id").references(() => matches.id, {
      onDelete: "cascade",
    }),
    type: flagType("type").notNull(),
    message: text("message").notNull(),
    resolved: boolean("resolved").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [index("match_flags_prospective_idx").on(t.prospectiveId)],
);

// ---------------------------------------------------------------------------
// Upload tracking + settings
// ---------------------------------------------------------------------------

export const importBatches = pgTable("import_batches", {
  id: uuid("id").primaryKey().defaultRandom(),
  kind: importKind("kind").notNull(),
  fileName: text("file_name"),
  rowCount: integer("row_count"),
  notes: text("notes"),
  uploadedBy: uuid("uploaded_by").references(() => profiles.id),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

// Simple key/value app settings (e.g. host_soft_cap, interview_minutes).
export const appSettings = pgTable("app_settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

// ---------------------------------------------------------------------------
// Schedule grid (reused from coverage-planner: block times per day-type)
// Used to compute free periods and lay out the day skeleton.
// ---------------------------------------------------------------------------

export const divisions = pgTable("divisions", {
  id: uuid("id").primaryKey().defaultRandom(),
  code: divisionCode("code").notNull().unique(),
  label: text("label").notNull(),
});

export const blockTemplates = pgTable(
  "block_templates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    divisionId: uuid("division_id")
      .references(() => divisions.id, { onDelete: "cascade" })
      .notNull(),
    dayType: dayType("day_type").notNull(),
    dayNumber: integer("day_number"), // 1-8 for US; null = applies to all matching day_type
    label: text("label").notNull(), // "A", "E", "Advisory", "Lunch"
    startTime: time("start_time").notNull(),
    endTime: time("end_time").notNull(),
    sortOrder: integer("sort_order").notNull(),
    isAcademic: boolean("is_academic").notNull().default(true),
  },
  (t) => [
    uniqueIndex("block_templates_div_daytype_daynum_label_idx").on(
      t.divisionId,
      t.dayType,
      t.dayNumber,
      t.label,
    ),
  ],
);

export const academicYears = pgTable("academic_years", {
  id: uuid("id").primaryKey().defaultRandom(),
  divisionId: uuid("division_id")
    .references(() => divisions.id, { onDelete: "cascade" })
    .notNull(),
  label: text("label").notNull(),
  rotationKind: rotationKind("rotation_kind").notNull(),
  startDate: date("start_date"),
  startDayType: dayType("start_day_type"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

// Maps each calendar date to its day-type (and 1-8 day number for US).
export const academicDays = pgTable(
  "academic_days",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    academicYearId: uuid("academic_year_id")
      .references(() => academicYears.id, { onDelete: "cascade" })
      .notNull(),
    date: date("date").notNull(),
    dayType: dayType("day_type").notNull(),
    dayNumber: integer("day_number"),
    notes: text("notes"),
  },
  (t) => [uniqueIndex("academic_days_year_date_idx").on(t.academicYearId, t.date)],
);
