// Harta Accesibilității — database schema v0.3 (2026-10-30)
// SQLite on Cloudflare D1, written with Drizzle ORM.
// Matches diagrams/db/10_db_schema.puml.
//
// Conventions
// - IDs: random text IDs created in code (crypto.randomUUID()), except the two
//   append-only tables (change_log, search_events), which count up.
// - Timestamps: stored as integers (milliseconds); Drizzle gives you Date objects.
// - Translations: JSON text { ro, en }.
// - Fixed lists ("enums"): text columns, typed in TypeScript AND checked by the
//   database (CHECK constraints), so a bug can't store a wrong value.
// - Column names: snake_case in the database, camelCase in TypeScript.

import { sql } from "drizzle-orm";
import {
  sqliteTable,
  text,
  integer,
  real,
  index,
  uniqueIndex,
  check,
  type AnySQLiteColumn,
} from "drizzle-orm/sqlite-core";

// ---------------------------------------------------------------------------
// Shared value lists
// ---------------------------------------------------------------------------

export const ROLES = ["user", "reviewer", "admin"] as const;
export const LEVELS = ["accessible", "partial", "inaccessible"] as const;
export const RESULT_LEVELS = [...LEVELS, "not_applicable"] as const;
export const PLACE_SOURCES = ["osm", "admin"] as const;
export const OSM_TYPES = ["node", "way", "relation"] as const;
export const PLACE_STATUSES = ["active", "hidden", "gone_from_osm"] as const;
export const CRITERION_GROUPS = ["entry", "inside", "parking"] as const;
export const QUESTION_TYPES = ["choice", "checkboxes", "text"] as const;
export const ASSESSMENT_ORIGINS = ["motivatie_import", "user_submission", "admin_edit"] as const;
export const SUBMISSION_KINDS = ["first_assessment", "update"] as const;
export const SUBMISSION_STATUSES = ["pending", "approved", "rejected"] as const;
export const SUGGESTION_STRATEGIES = ["rules", "ml"] as const;
export const CHANGE_ACTIONS = ["insert", "update", "delete"] as const;

export type Translated = { ro: string; en: string };
export type QuestionOption = { code: string; label: Translated };
// What an answer's value looks like, depending on the question type:
//   choice     -> "yes"
//   checkboxes -> ["curb", "stairs"]
//   text       -> "80 cm, opens outward"
export type AnswerValue = string | string[];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const id = () =>
  text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID());

const timestamp = (name: string) => integer(name, { mode: "timestamp_ms" });

const createdAt = () =>
  timestamp("created_at")
    .notNull()
    .$defaultFn(() => new Date());

const updatedAt = () =>
  timestamp("updated_at")
    .notNull()
    .$defaultFn(() => new Date())
    .$onUpdateFn(() => new Date());

/** CHECK that a column only holds one of the allowed values. */
const oneOf = (column: string, values: readonly string[]) =>
  sql.raw(`"${column}" IN (${values.map((v) => `'${v}'`).join(", ")})`);

/** Same, but the column may also be empty (NULL). */
const oneOfOrNull = (column: string, values: readonly string[]) =>
  sql.raw(`"${column}" IS NULL OR "${column}" IN (${values.map((v) => `'${v}'`).join(", ")})`);

// ===========================================================================
// PEOPLE — Better Auth tables (users, sessions, accounts, verifications)
// ===========================================================================
// Better Auth expects these four tables. Their columns follow Better Auth's core
// schema; we add `role` and `deleted_at` to users. Configure the Drizzle adapter
// with `usePlural: true` and `user.additionalFields: { role, deletedAt }`.
// Before the first migration, compare with `npx @better-auth/cli generate`.

export const users = sqliteTable(
  "users",
  {
    id: id(),
    name: text("name").notNull(),
    email: text("email").notNull().unique(),
    emailVerified: integer("email_verified", { mode: "boolean" }).notNull().default(false),
    image: text("image"),
    // --- added by us ---
    role: text("role", { enum: ROLES }).notNull().default("user"),
    /** Set when the person deletes their account: name and email are wiped,
     *  the row stays so their approved contributions keep a valid link. */
    deletedAt: timestamp("deleted_at"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [check("users_role_ck", oneOf("role", ROLES))],
);

export const sessions = sqliteTable(
  "sessions",
  {
    id: id(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    token: text("token").notNull().unique(),
    expiresAt: timestamp("expires_at").notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("sessions_user_idx").on(t.userId)],
);

export const accounts = sqliteTable(
  "accounts",
  {
    id: id(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(), // "credential", "google", "apple"
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at"),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
    scope: text("scope"),
    password: text("password"), // hashed by Better Auth, only for email sign-in
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("accounts_user_idx").on(t.userId)],
);

export const verifications = sqliteTable("verifications", {
  id: id(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

// ===========================================================================
// PLACES
// ===========================================================================

export const categories = sqliteTable("categories", {
  id: id(),
  code: text("code").notNull().unique(), // "health", "food_drink"
  name: text("name", { mode: "json" }).$type<Translated>().notNull(),
  icon: text("icon").notNull(),
  /** OpenStreetMap tags that belong here, e.g. ["amenity=pharmacy", "healthcare=*"]. */
  osmTags: text("osm_tags", { mode: "json" }).$type<string[]>().notNull(),
  displayOrder: integer("display_order").notNull(),
  createdAt: createdAt(),
});

export const places = sqliteTable(
  "places",
  {
    id: id(),
    source: text("source", { enum: PLACE_SOURCES }).notNull(),
    osmType: text("osm_type", { enum: OSM_TYPES }),
    osmId: integer("osm_id"),
    osmTag: text("osm_tag"), // "amenity=cafe"
    osmSyncedAt: timestamp("osm_synced_at"),

    name: text("name").notNull(),
    otherNames: text("other_names", { mode: "json" }).$type<string[]>(),
    categoryId: text("category_id")
      .notNull()
      .references(() => categories.id),
    lat: real("lat").notNull(),
    lng: real("lng").notNull(),
    address: text("address"),

    status: text("status", { enum: PLACE_STATUSES }).notNull().default("active"),

    // --- copied from the current assessment; written ONLY by the approval step ---
    /** Empty = "Not yet rated". Set only when the publishing rule is met. */
    publishedLevel: text("published_level", { enum: LEVELS }),
    hasDesignatedParking: integer("has_designated_parking", { mode: "boolean" }),
    lastVerifiedAt: timestamp("last_verified_at"),

    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("places_osm_uq").on(t.osmType, t.osmId),
    index("places_lat_lng_idx").on(t.lat, t.lng),
    index("places_category_idx").on(t.categoryId),
    index("places_published_idx").on(t.publishedLevel),
    check("places_source_ck", oneOf("source", PLACE_SOURCES)),
    check("places_osm_type_ck", oneOfOrNull("osm_type", OSM_TYPES)),
    check("places_status_ck", oneOf("status", PLACE_STATUSES)),
    check("places_level_ck", oneOfOrNull("published_level", LEVELS)),
    // An OSM place must have its OSM type and ID; an admin place must not.
    check(
      "places_osm_fields_ck",
      sql`(source = 'osm' AND osm_type IS NOT NULL AND osm_id IS NOT NULL)
       OR (source = 'admin' AND osm_type IS NULL AND osm_id IS NULL)`,
    ),
    check("places_lat_ck", sql`lat BETWEEN -90 AND 90`),
    check("places_lng_ck", sql`lng BETWEEN -180 AND 180`),
  ],
);

// ===========================================================================
// QUESTIONNAIRE (the template)
// ===========================================================================

export const criteria = sqliteTable(
  "criteria",
  {
    id: id(),
    code: text("code").notNull().unique(), // "entrance_doors"
    name: text("name", { mode: "json" }).$type<Translated>().notNull(),
    group: text("group", { enum: CRITERION_GROUPS }).notNull(),
    isMandatory: integer("is_mandatory", { mode: "boolean" }).notNull(),
    displayOrder: integer("display_order").notNull(),
    isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
    createdAt: createdAt(),
  },
  (t) => [check("criteria_group_ck", oneOf("group", CRITERION_GROUPS))],
);

export const questions = sqliteTable(
  "questions",
  {
    id: id(),
    criterionId: text("criterion_id")
      .notNull()
      .references(() => criteria.id),
    code: text("code").notNull(), // "main", "barriers", "notes"
    prompt: text("prompt", { mode: "json" }).$type<Translated>().notNull(),
    type: text("type", { enum: QUESTION_TYPES }).notNull(),
    /** Choices for "choice" and "checkboxes" questions; empty for "text". */
    options: text("options", { mode: "json" }).$type<QuestionOption[]>(),
    /** The main answer of the criterion (e.g. Yes / No / Not needed). */
    isMain: integer("is_main", { mode: "boolean" }).notNull().default(false),
    isRequired: integer("is_required", { mode: "boolean" }).notNull(),
    displayOrder: integer("display_order").notNull(),
    /** false = retired: kept so old answers still point to the question actually asked. */
    isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("questions_criterion_code_uq").on(t.criterionId, t.code),
    // At most one main question per criterion.
    uniqueIndex("questions_one_main_uq").on(t.criterionId).where(sql`is_main = 1`),
    check("questions_type_ck", oneOf("type", QUESTION_TYPES)),
    // Choice and checkbox questions need options; text questions don't have any.
    check(
      "questions_options_ck",
      sql`(type = 'text' AND options IS NULL) OR (type <> 'text' AND options IS NOT NULL)`,
    ),
    // The main answer is always a single choice.
    check("questions_main_is_choice_ck", sql`is_main = 0 OR type = 'choice'`),
  ],
);

// ===========================================================================
// WHAT WAS FOUND AT A PLACE
// ===========================================================================

export const assessments = sqliteTable(
  "assessments",
  {
    id: id(),
    placeId: text("place_id")
      .notNull()
      .references(() => places.id),
    origin: text("origin", { enum: ASSESSMENT_ORIGINS }).notNull(),
    /** The assessment this one was built from when an update was approved. */
    basedOnId: text("based_on_id").references((): AnySQLiteColumn => assessments.id),
    overallLevel: text("overall_level", { enum: LEVELS }),
    isCurrent: integer("is_current", { mode: "boolean" }).notNull().default(false),
    verifiedAt: timestamp("verified_at"),
    createdAt: createdAt(),
  },
  (t) => [
    // A place can never have two current assessments, whatever the code does.
    uniqueIndex("assessments_one_current_uq").on(t.placeId).where(sql`is_current = 1`),
    index("assessments_place_idx").on(t.placeId),
    check("assessments_origin_ck", oneOf("origin", ASSESSMENT_ORIGINS)),
    check("assessments_level_ck", oneOfOrNull("overall_level", LEVELS)),
    // Current means verified.
    check("assessments_current_verified_ck", sql`is_current = 0 OR verified_at IS NOT NULL`),
  ],
);

export const criterionResults = sqliteTable(
  "criterion_results",
  {
    id: id(),
    assessmentId: text("assessment_id")
      .notNull()
      .references(() => assessments.id, { onDelete: "cascade" }),
    criterionId: text("criterion_id")
      .notNull()
      .references(() => criteria.id),
    level: text("level", { enum: RESULT_LEVELS }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("criterion_results_uq").on(t.assessmentId, t.criterionId),
    check("criterion_results_level_ck", oneOf("level", RESULT_LEVELS)),
  ],
);

export const answers = sqliteTable(
  "answers",
  {
    id: id(),
    criterionResultId: text("criterion_result_id")
      .notNull()
      .references(() => criterionResults.id, { onDelete: "cascade" }),
    questionId: text("question_id")
      .notNull()
      .references(() => questions.id),
    value: text("value", { mode: "json" }).$type<AnswerValue>().notNull(),
  },
  (t) => [
    uniqueIndex("answers_uq").on(t.criterionResultId, t.questionId),
    check("answers_value_json_ck", sql`json_valid(value)`),
  ],
);

export const photos = sqliteTable(
  "photos",
  {
    id: id(),
    criterionResultId: text("criterion_result_id")
      .notNull()
      .references(() => criterionResults.id, { onDelete: "cascade" }),
    /** Where the file lives in the R2 bucket. Not unique: an approved update
     *  copies unchanged results, and their photo rows point to the same file. */
    r2Key: text("r2_key").notNull(),
    position: integer("position").notNull(), // 1, 2 or 3
    uploadedBy: text("uploaded_by").references(() => users.id),
    createdAt: createdAt(),
  },
  (t) => [
    // With positions 1-3 and this unique rule, a 4th photo is impossible.
    uniqueIndex("photos_position_uq").on(t.criterionResultId, t.position),
    check("photos_position_ck", sql`position BETWEEN 1 AND 3`),
  ],
);

// ===========================================================================
// REVIEW
// ===========================================================================

export const submissions = sqliteTable(
  "submissions",
  {
    id: id(),
    assessmentId: text("assessment_id")
      .notNull()
      .unique()
      .references(() => assessments.id),
    kind: text("kind", { enum: SUBMISSION_KINDS }).notNull(),
    status: text("status", { enum: SUBMISSION_STATUSES }).notNull().default("pending"),
    submittedBy: text("submitted_by")
      .notNull()
      .references(() => users.id),
    submittedAt: timestamp("submitted_at")
      .notNull()
      .$defaultFn(() => new Date()),

    // "Opened by Ana 5 minutes ago" warning (no blocking)
    reviewingBy: text("reviewing_by").references(() => users.id),
    reviewingSince: timestamp("reviewing_since"),

    // The decision
    reviewedBy: text("reviewed_by").references(() => users.id),
    reviewedAt: timestamp("reviewed_at"),
    rejectionReason: text("rejection_reason"),
    editedByReviewer: integer("edited_by_reviewer", { mode: "boolean" }).notNull().default(false),

    /** Set by the cleanup job once a rejected submission's photos are deleted. */
    photosDeletedAt: timestamp("photos_deleted_at"),
  },
  (t) => [
    index("submissions_queue_idx").on(t.status, t.submittedAt),
    index("submissions_user_idx").on(t.submittedBy),
    check("submissions_kind_ck", oneOf("kind", SUBMISSION_KINDS)),
    check("submissions_status_ck", oneOf("status", SUBMISSION_STATUSES)),
    // A decided submission records who decided it and when.
    check(
      "submissions_decided_ck",
      sql`status = 'pending' OR (reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL)`,
    ),
    // A rejection always has a reason.
    check("submissions_reason_ck", sql`status <> 'rejected' OR rejection_reason IS NOT NULL`),
  ],
);

export const scoreSuggestions = sqliteTable(
  "score_suggestions",
  {
    id: id(),
    submissionId: text("submission_id")
      .notNull()
      .references(() => submissions.id, { onDelete: "cascade" }),
    strategy: text("strategy", { enum: SUGGESTION_STRATEGIES }).notNull(),
    modelVersion: text("model_version"),
    level: text("level", { enum: LEVELS }).notNull(),
    /** Reasons and reviewer notes, e.g. { reasons: [...], notes: ["no_parking"] } */
    explanation: text("explanation", { mode: "json" }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    index("score_suggestions_submission_idx").on(t.submissionId),
    check("score_suggestions_strategy_ck", oneOf("strategy", SUGGESTION_STRATEGIES)),
    check("score_suggestions_level_ck", oneOf("level", LEVELS)),
  ],
);

// ===========================================================================
// TRACKING
// ===========================================================================

/** Every change, written in the same batch as the change itself.
 *  table_name + record_id is a "loose" link: it can point to any table. */
export const changeLog = sqliteTable(
  "change_log",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    tableName: text("table_name").notNull(),
    recordId: text("record_id").notNull(),
    action: text("action", { enum: CHANGE_ACTIONS }).notNull(),
    oldRow: text("old_row", { mode: "json" }),
    newRow: text("new_row", { mode: "json" }),
    /** Empty = a change made by the system (e.g. the OpenStreetMap import). */
    changedBy: text("changed_by").references(() => users.id),
    changedAt: timestamp("changed_at")
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => [
    index("change_log_record_idx").on(t.tableName, t.recordId),
    check("change_log_action_ck", oneOf("action", CHANGE_ACTIONS)),
  ],
);

/** P2 — what people search for, to show MOTIVAȚIE which places to assess next.
 *  Deliberately stores no user. */
export const searchEvents = sqliteTable("search_events", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  query: text("query").notNull(),
  resultCount: integer("result_count").notNull(),
  openedPlaceId: text("opened_place_id").references(() => places.id, { onDelete: "set null" }),
  createdAt: createdAt(),
});
