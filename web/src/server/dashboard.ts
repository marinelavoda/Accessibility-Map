// Read-only queries for the staff dashboard. Unlike ./public-places.ts these DO return
// pending submissions, hidden places and people's emails, so they must only ever be
// called from a dashboard page AFTER requireRole() has let the person in.

import { and, asc, count, desc, eq, isNotNull, isNull, ne, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/sqlite-core";
import { getDb } from "@/db";
import { assessments, categories, places, scoreSuggestions, submissions, users } from "@/db/schema";
import { PAGE_SIZE, toSearchQuery, type PlaceFilters } from "@/lib/place-filters";

export async function getOverviewCounts() {
  const db = getDb();
  const [[pending], [active], [rated], [hidden], [staff]] = await db.batch([
    db.select({ n: count() }).from(submissions).where(eq(submissions.status, "pending")),
    db.select({ n: count() }).from(places).where(eq(places.status, "active")),
    db.select({ n: count() }).from(places).where(isNotNull(places.publishedLevel)),
    db.select({ n: count() }).from(places).where(eq(places.status, "hidden")),
    db.select({ n: count() }).from(users).where(sql`${users.role} IN ('reviewer', 'admin')`),
  ]);
  return {
    pendingSubmissions: pending.n,
    activePlaces: active.n,
    ratedPlaces: rated.n,
    hiddenPlaces: hidden.n,
    staff: staff.n,
  };
}

/** Pending submissions, oldest first (the order reviewers should work in). */
export async function listReviewQueue() {
  const submitter = alias(users, "submitter");
  const openedBy = alias(users, "opened_by");
  return getDb()
    .select({
      id: submissions.id,
      kind: submissions.kind,
      submittedAt: submissions.submittedAt,
      placeName: places.name,
      submittedBy: submitter.name,
      openedBy: openedBy.name,
      openedSince: submissions.reviewingSince,
      suggestedLevel: scoreSuggestions.level,
    })
    .from(submissions)
    .innerJoin(assessments, eq(assessments.id, submissions.assessmentId))
    .innerJoin(places, eq(places.id, assessments.placeId))
    .innerJoin(submitter, eq(submitter.id, submissions.submittedBy))
    .leftJoin(openedBy, eq(openedBy.id, submissions.reviewingBy))
    .leftJoin(scoreSuggestions, and(eq(scoreSuggestions.submissionId, submissions.id), eq(scoreSuggestions.strategy, "rules")))
    .where(eq(submissions.status, "pending"))
    .orderBy(asc(submissions.submittedAt));
}

/** The most recently approved or rejected submissions. */
export async function listRecentDecisions(limit = 10) {
  const decidedBy = alias(users, "decided_by");
  return getDb()
    .select({
      id: submissions.id,
      status: submissions.status,
      reviewedAt: submissions.reviewedAt,
      placeName: places.name,
      decidedBy: decidedBy.name,
    })
    .from(submissions)
    .innerJoin(assessments, eq(assessments.id, submissions.assessmentId))
    .innerJoin(places, eq(places.id, assessments.placeId))
    .leftJoin(decidedBy, eq(decidedBy.id, submissions.reviewedBy))
    .where(ne(submissions.status, "pending"))
    .orderBy(desc(submissions.reviewedAt))
    .limit(limit);
}

/**
 * One page of the Places list, with the search and filters applied. Includes hidden places.
 * Two queries run side by side: the page of places, and how many match in total.
 * (Not one db.batch: places.name and categories.name would get mixed up inside a batch.)
 */
export async function listPlaces(filters: PlaceFilters) {
  const conditions: SQL[] = [];
  const search = toSearchQuery(filters.q);
  if (search) conditions.push(sql`${places.id} IN (SELECT place_id FROM place_search WHERE place_search MATCH ${search})`);
  if (filters.category) conditions.push(eq(places.categoryId, filters.category));
  if (filters.level === "unrated") conditions.push(isNull(places.publishedLevel));
  else if (filters.level) conditions.push(eq(places.publishedLevel, filters.level));
  if (filters.status) conditions.push(eq(places.status, filters.status));
  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const order = {
    // Rated places that were verified longest ago first (they need re-checking); never-rated last.
    overdue: [sql`${places.lastVerifiedAt} IS NULL`, asc(places.lastVerifiedAt), sql`${places.name} COLLATE NOCASE`],
    name: [sql`${places.name} COLLATE NOCASE`],
    newest: [desc(places.createdAt)],
  }[filters.sort];

  const db = getDb();
  const [rows, [{ total }]] = await Promise.all([
    db
      .select({
        id: places.id,
        name: places.name,
        category: categories.name,
        source: places.source,
        status: places.status,
        level: places.publishedLevel,
        lastVerifiedAt: places.lastVerifiedAt,
      })
      .from(places)
      .innerJoin(categories, eq(categories.id, places.categoryId))
      .where(where)
      .orderBy(...order)
      .limit(PAGE_SIZE)
      .offset((filters.page - 1) * PAGE_SIZE),
    db.select({ total: count() }).from(places).where(where),
  ]);
  return { rows, total };
}

/** Everyone with an account (deleted accounts excluded), staff first. */
export async function listUsers() {
  return getDb()
    .select({ id: users.id, name: users.name, email: users.email, role: users.role, createdAt: users.createdAt })
    .from(users)
    .where(sql`${users.deletedAt} IS NULL`)
    .orderBy(sql`CASE ${users.role} WHEN 'admin' THEN 0 WHEN 'reviewer' THEN 1 ELSE 2 END`, desc(users.createdAt));
}
