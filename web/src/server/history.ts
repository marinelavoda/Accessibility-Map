// Read-only queries for the change history page (admins only, PRD R26).
// Call only from a page that has already run requireRole("admin").
//
// change_log.record_id is a "loose" link: it can point to a place, an assessment,
// a submission or a user, depending on table_name. To show which PLACE a change is
// about, we follow the links: assessment -> place, submission -> assessment -> place.

import { and, desc, eq, isNotNull, isNull, lt, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/sqlite-core";
import { getDb } from "@/db";
import { assessments, changeLog, places, submissions, users } from "@/db/schema";

export const PAGE_SIZE = 50;

/** The tables that write to change_log, with the label shown in the filter. */
export const HISTORY_TABLES = {
  places: "Places",
  assessments: "Assessments",
  submissions: "Submissions",
  users: "Users",
} as const;

export type HistoryFilters = {
  table?: string; // one of HISTORY_TABLES
  by?: string; // a user id, or "system"
  place?: string; // a place id
  before?: number; // for "Older changes": only rows with a smaller id
};

export async function listChanges(filters: HistoryFilters) {
  const changer = alias(users, "changer");
  const changedUser = alias(users, "changed_user");
  const directPlace = alias(places, "direct_place");
  const viaPlace = alias(places, "via_place");
  const assessment = alias(assessments, "assessment");
  const submission = alias(submissions, "submission");
  const submissionAssessment = alias(assessments, "submission_assessment");

  const placeId = sql<string | null>`coalesce(${directPlace.id}, ${viaPlace.id})`;

  const conditions: SQL[] = [];
  if (filters.table && filters.table in HISTORY_TABLES) conditions.push(eq(changeLog.tableName, filters.table));
  if (filters.by === "system") conditions.push(isNull(changeLog.changedBy));
  else if (filters.by) conditions.push(eq(changeLog.changedBy, filters.by));
  if (filters.place) conditions.push(sql`${placeId} = ${filters.place}`);
  if (filters.before) conditions.push(lt(changeLog.id, filters.before));

  const rows = await getDb()
    .select({
      id: changeLog.id,
      tableName: changeLog.tableName,
      recordId: changeLog.recordId,
      action: changeLog.action,
      oldRow: changeLog.oldRow,
      newRow: changeLog.newRow,
      changedAt: changeLog.changedAt,
      changedById: changeLog.changedBy,
      changedByName: changer.name,
      changedByDeleted: changer.deletedAt,
      placeId,
      placeName: sql<string | null>`coalesce(${directPlace.name}, ${viaPlace.name})`,
      userName: changedUser.name,
    })
    .from(changeLog)
    .leftJoin(changer, eq(changer.id, changeLog.changedBy))
    .leftJoin(changedUser, and(eq(changeLog.tableName, "users"), eq(changedUser.id, changeLog.recordId)))
    .leftJoin(directPlace, and(eq(changeLog.tableName, "places"), eq(directPlace.id, changeLog.recordId)))
    .leftJoin(assessment, and(eq(changeLog.tableName, "assessments"), eq(assessment.id, changeLog.recordId)))
    .leftJoin(submission, and(eq(changeLog.tableName, "submissions"), eq(submission.id, changeLog.recordId)))
    .leftJoin(submissionAssessment, eq(submissionAssessment.id, submission.assessmentId))
    .leftJoin(viaPlace, eq(viaPlace.id, sql`coalesce(${assessment.placeId}, ${submissionAssessment.placeId})`))
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(changeLog.id))
    .limit(PAGE_SIZE + 1); // one extra row tells us whether there is an older page

  return { changes: rows.slice(0, PAGE_SIZE), hasOlder: rows.length > PAGE_SIZE };
}

/** People who appear in the change log, for the "Changed by" filter. */
export async function listChangers() {
  return getDb()
    .selectDistinct({ id: users.id, name: users.name })
    .from(changeLog)
    .innerJoin(users, eq(users.id, changeLog.changedBy))
    .where(isNotNull(changeLog.changedBy))
    .orderBy(users.name);
}

export async function getPlaceName(placeId: string) {
  const [place] = await getDb().select({ name: places.name }).from(places).where(eq(places.id, placeId));
  return place?.name ?? null;
}
