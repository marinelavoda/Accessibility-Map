// Managing places from the dashboard (PRD: admins add a missing place, edit, hide, delete).
// Reads are for reviewers and admins; every write is for admins only. The calling page or
// server action must run requireRole() first (hard rule 1).
//
// What these functions may change: a place's own details (name, other names, category,
// location, address) and its status. NEVER the published fields (published_level,
// has_designated_parking, last_verified_at): only the approval step writes those (hard rule 3).

import { and, asc, between, count, desc, eq, ne, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/sqlite-core";
import { getDb } from "@/db";
import { assessments, categories, changeLog, criteria, criterionResults, places, submissions, users } from "@/db/schema";
import { changedFields, nearbyBox, whyNotDeletable, type PlaceInput } from "@/lib/place-input";
import type { CurrentUser } from "./require-role";

/** A problem the admin can fix; its message is shown on the page. */
export class PlaceError extends Error {}

export async function listCategories() {
  return getDb()
    .select({ id: categories.id, name: categories.name })
    .from(categories)
    .orderBy(asc(categories.displayOrder));
}

/** Everything the place page shows: details, the published assessment, and its submissions. */
export async function getPlaceDetails(placeId: string) {
  const db = getDb();
  const submitter = alias(users, "submitter");
  // The place query runs outside the batch: inside one, Drizzle mixes up columns that share
  // a name (places.name and categories.name) and fails to read the row.
  const placeQuery = db
    .select({ place: places, category: categories.name })
    .from(places)
    .innerJoin(categories, eq(categories.id, places.categoryId))
    .where(eq(places.id, placeId));
  const batch = db.batch([
    db
      .select({ criterion: criteria.name, level: criterionResults.level, verifiedAt: assessments.verifiedAt })
      .from(criterionResults)
      .innerJoin(assessments, eq(assessments.id, criterionResults.assessmentId))
      .innerJoin(criteria, eq(criteria.id, criterionResults.criterionId))
      .where(and(eq(assessments.placeId, placeId), eq(assessments.isCurrent, true)))
      .orderBy(asc(criteria.displayOrder)),
    db
      .select({
        id: submissions.id,
        kind: submissions.kind,
        status: submissions.status,
        submittedAt: submissions.submittedAt,
        submittedBy: submitter.name,
      })
      .from(submissions)
      .innerJoin(assessments, eq(assessments.id, submissions.assessmentId))
      .innerJoin(submitter, eq(submitter.id, submissions.submittedBy))
      .where(eq(assessments.placeId, placeId))
      .orderBy(desc(submissions.submittedAt)),
    db.select({ n: count() }).from(assessments).where(eq(assessments.placeId, placeId)),
  ]);
  const [placeRows, [results, placeSubmissions, [assessmentCount]]] = await Promise.all([placeQuery, batch]);
  if (placeRows.length === 0) return null;
  return { ...placeRows[0], results, submissions: placeSubmissions, assessmentCount: assessmentCount.n };
}

export type PlaceDetails = NonNullable<Awaited<ReturnType<typeof getPlaceDetails>>>;

/** Places within about 100 m, so an admin doesn't add a place that's already there. */
export async function findNearbyPlaces(lat: number, lng: number, exceptId?: string) {
  const box = nearbyBox(lat, lng);
  return getDb()
    .select({ id: places.id, name: places.name, address: places.address, status: places.status })
    .from(places)
    .where(
      and(
        between(places.lat, box.minLat, box.maxLat),
        between(places.lng, box.minLng, box.maxLng),
        exceptId ? ne(places.id, exceptId) : undefined,
      ),
    )
    .limit(10);
}

// ---------------------------------------------------------------------------
// Writes (admins only). Each one is a single batch: the change + its change_log row.
// ---------------------------------------------------------------------------

export async function createPlace(admin: CurrentUser, input: PlaceInput): Promise<string> {
  const db = getDb();
  const id = crypto.randomUUID();
  const now = new Date();
  // source "admin": no OpenStreetMap ID (a database rule checks this).
  const row = { id, source: "admin" as const, ...input, status: "active" as const, createdAt: now, updatedAt: now };
  await runBatch([
    db.insert(places).values(row),
    db.insert(changeLog).values({
      tableName: "places",
      recordId: id,
      action: "insert",
      newRow: forLog({ source: "admin", ...input, status: "active" }),
      changedBy: admin.id,
      changedAt: now,
    }),
  ]);
  return id;
}

/**
 * Saves new details. `version` is the place's updated_at when the admin opened the form:
 * if anyone changed the place since then, nothing is saved and the admin is asked to reload,
 * instead of silently overwriting the other person's change.
 */
export async function updatePlace(admin: CurrentUser, placeId: string, input: PlaceInput, version: number) {
  const db = getDb();
  const [current] = await db.select().from(places).where(eq(places.id, placeId));
  if (!current) throw new PlaceError("This place no longer exists.");
  if (current.updatedAt.getTime() !== version) throw new PlaceError(CHANGED_MEANWHILE);

  const { oldRow, newRow, changed } = changedFields(current, input);
  if (!changed) return false;

  const now = new Date();
  await runBatch([
    db
      .update(places)
      .set({ ...input, updatedAt: now })
      .where(and(eq(places.id, placeId), eq(places.updatedAt, current.updatedAt))),
    guardedPlaceLog(placeId, now, { action: "update", oldRow: forLog(oldRow), newRow: forLog(newRow), changedBy: admin.id }),
  ]);
  return true;
}

/** Hide a place from the public app, or show it again. Its data is kept either way. */
export async function setPlaceStatus(admin: CurrentUser, placeId: string, status: "active" | "hidden") {
  const db = getDb();
  const [current] = await db.select({ status: places.status }).from(places).where(eq(places.id, placeId));
  if (!current) throw new PlaceError("This place no longer exists.");
  if (current.status === status) return;

  const now = new Date();
  await runBatch([
    db
      .update(places)
      .set({ status, updatedAt: now })
      .where(and(eq(places.id, placeId), eq(places.status, current.status))),
    guardedPlaceLog(placeId, now, {
      action: "update",
      oldRow: { status: current.status },
      newRow: { status },
      changedBy: admin.id,
    }),
  ]);
}

/**
 * Deletes a place for good. Only for places an admin added by mistake (e.g. a duplicate):
 * - a place with any assessment keeps its history, so it can only be hidden;
 * - an OpenStreetMap place would come back with the next import, so it can only be hidden.
 */
export async function deletePlace(admin: CurrentUser, placeId: string) {
  const db = getDb();
  const [current] = await db.select().from(places).where(eq(places.id, placeId));
  if (!current) throw new PlaceError("This place no longer exists.");
  const reason = whyNotDeletable(current.source, (await db.select({ n: count() }).from(assessments).where(eq(assessments.placeId, placeId)))[0].n);
  if (reason) throw new PlaceError(reason);

  // The log row goes first: once the place is deleted there is nothing left to check.
  // Its guard only passes while the place exists and has no assessments.
  const tableNameIfDeletable = sql`(SELECT 'places' FROM places WHERE id = ${placeId} AND source = 'admin'
    AND NOT EXISTS (SELECT 1 FROM assessments WHERE place_id = ${placeId}))`;
  await runBatch([
    db.insert(changeLog).values({
      tableName: tableNameIfDeletable,
      recordId: placeId,
      action: "delete",
      // What the place was, minus empty fields, which would only add "empty → removed" lines.
      oldRow: forLog(Object.fromEntries(Object.entries({
        source: current.source,
        name: current.name,
        otherNames: current.otherNames,
        categoryId: current.categoryId,
        lat: current.lat,
        lng: current.lng,
        address: current.address,
        status: current.status,
      }).filter(([, value]) => value !== null))),
      changedBy: admin.id,
    }),
    db.delete(places).where(eq(places.id, placeId)),
  ]);
}

// ---------------------------------------------------------------------------

/** A change_log row's fields, named like the database columns (other_names, category_id),
 *  the same way the approval step logs them. */
function forLog(row: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(row).map(([key, value]) => [key.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`), value]));
}

const CHANGED_MEANWHILE = "Someone changed this place since you opened it. Reload the page to see the latest version.";

/**
 * The change_log row for an edit, which also acts as a safety check (same idea as the
 * review decision in ./review.ts): its table_name is only found if THIS edit was saved
 * (updated_at = the time we wrote). If the update matched nothing because someone else
 * changed the place first, table_name is NULL, the NOT NULL rule fails, and D1 cancels
 * the whole batch.
 */
function guardedPlaceLog(
  placeId: string,
  at: Date,
  entry: { action: "update"; oldRow: unknown; newRow: unknown; changedBy: string },
) {
  const tableNameIfSaved = sql`(SELECT 'places' FROM places WHERE id = ${placeId} AND updated_at = ${at.getTime()})`;
  return getDb()
    .insert(changeLog)
    .values({ tableName: tableNameIfSaved, recordId: placeId, changedAt: at, ...entry });
}

type Statement = Parameters<ReturnType<typeof getDb>["batch"]>[0][number];

async function runBatch(statements: [Statement, ...Statement[]]) {
  try {
    await getDb().batch(statements);
  } catch (error) {
    const text = String(error instanceof Error ? `${error.message} ${error.cause ?? ""}` : error);
    console.error("Place batch failed", error);
    if (!/constraint/i.test(text)) throw error; // a bug, not a conflict: show it as one
    throw new PlaceError(CHANGED_MEANWHILE);
  }
}
