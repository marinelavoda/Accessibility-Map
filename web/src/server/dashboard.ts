// Read-only queries for the staff dashboard. Unlike ./public-places.ts these DO return
// pending submissions, hidden places and people's emails, so they must only ever be
// called from a dashboard page AFTER requireRole() has let the person in.

import { asc, count, desc, eq, isNotNull, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/sqlite-core";
import { getDb } from "@/db";
import { assessments, categories, places, submissions, users } from "@/db/schema";

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
    })
    .from(submissions)
    .innerJoin(assessments, eq(assessments.id, submissions.assessmentId))
    .innerJoin(places, eq(places.id, assessments.placeId))
    .innerJoin(submitter, eq(submitter.id, submissions.submittedBy))
    .leftJoin(openedBy, eq(openedBy.id, submissions.reviewingBy))
    .where(eq(submissions.status, "pending"))
    .orderBy(asc(submissions.submittedAt));
}

/** Every place, including hidden ones. Longest since verification first; never-rated last. */
export async function listAllPlaces() {
  return getDb()
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
    .orderBy(sql`${places.lastVerifiedAt} IS NULL`, asc(places.lastVerifiedAt), asc(places.name));
}

/** Everyone with an account (deleted accounts excluded), staff first. */
export async function listUsers() {
  return getDb()
    .select({ id: users.id, name: users.name, email: users.email, role: users.role, createdAt: users.createdAt })
    .from(users)
    .where(sql`${users.deletedAt} IS NULL`)
    .orderBy(sql`CASE ${users.role} WHEN 'admin' THEN 0 WHEN 'reviewer' THEN 1 ELSE 2 END`, desc(users.createdAt));
}
