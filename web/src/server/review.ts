// Reviewing a submission: load it, approve it, reject it (sequence diagram 08c).
// Only ever called from the review page's server actions, AFTER requireRole("reviewer").
// Also admin edits of a published assessment (saveAdminEdit, AFTER requireRole("admin")),
// which go through the same approval steps.
//
// Approving and rejecting each save everything in ONE D1 batch (hard rule 4), including the
// change_log rows (hard rule 5). This is the only code allowed to make an assessment current
// and to set a place's published level (hard rule 3).

import { and, asc, eq, ne, sql } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
import { alias } from "drizzle-orm/sqlite-core";
import { getDb } from "@/db";
import {
  answers,
  assessments,
  categories,
  changeLog,
  criteria,
  criterionResults,
  photos,
  places,
  questions,
  scoreSuggestions,
  submissions,
  users,
} from "@/db/schema";
import type { Level } from "@/lib/scoring";
import { ApprovalError, planAdminEdit, planApproval, type Correction, type QuestionInfo, type StoredResult } from "./approval-plan";
import type { CurrentUser } from "./require-role";

export { ApprovalError };

// ---------------------------------------------------------------------------
// Loading
// ---------------------------------------------------------------------------

/** Every criterion with its questions, in form order. */
export async function loadQuestionnaire() {
  const db = getDb();
  const [criteriaRows, questionRows] = await db.batch([
    db.select().from(criteria).orderBy(asc(criteria.displayOrder)),
    db.select().from(questions).orderBy(asc(questions.displayOrder)),
  ]);
  return criteriaRows.map((c) => ({ ...c, questions: questionRows.filter((q) => q.criterionId === c.id) }));
}
export type Questionnaire = Awaited<ReturnType<typeof loadQuestionnaire>>;

/** The criterion results of one assessment, with their answers and photos. */
async function loadResults(assessmentId: string): Promise<StoredResult[]> {
  const db = getDb();
  const [resultRows, answerRows, photoRows] = await db.batch([
    db
      .select({ id: criterionResults.id, criterionId: criterionResults.criterionId, criterionCode: criteria.code, level: criterionResults.level })
      .from(criterionResults)
      .innerJoin(criteria, eq(criteria.id, criterionResults.criterionId))
      .where(eq(criterionResults.assessmentId, assessmentId))
      .orderBy(asc(criteria.displayOrder)),
    db
      .select({ id: answers.id, resultId: answers.criterionResultId, questionId: answers.questionId, value: answers.value })
      .from(answers)
      .innerJoin(criterionResults, eq(criterionResults.id, answers.criterionResultId))
      .where(eq(criterionResults.assessmentId, assessmentId)),
    db
      .select({ photo: photos })
      .from(photos)
      .innerJoin(criterionResults, eq(criterionResults.id, photos.criterionResultId))
      .where(eq(criterionResults.assessmentId, assessmentId))
      .orderBy(asc(photos.position)),
  ]);
  return resultRows.map((r) => ({
    ...r,
    answers: answerRows.filter((a) => a.resultId === r.id),
    photos: photoRows.filter(({ photo }) => photo.criterionResultId === r.id).map(({ photo }) => photo),
  }));
}

/** Everything the review page shows for one submission, or null if it doesn't exist. */
export async function loadSubmission(submissionId: string) {
  const db = getDb();
  const submitter = alias(users, "submitter");
  const openedBy = alias(users, "opened_by");
  const decidedBy = alias(users, "decided_by");

  const [row] = await db
    .select({
      submission: submissions,
      assessment: assessments,
      place: { id: places.id, name: places.name, address: places.address, publishedLevel: places.publishedLevel, status: places.status },
      category: categories.name,
      submittedBy: submitter.name,
      openedByName: openedBy.name,
      decidedByName: decidedBy.name,
    })
    .from(submissions)
    .innerJoin(assessments, eq(assessments.id, submissions.assessmentId))
    .innerJoin(places, eq(places.id, assessments.placeId))
    .innerJoin(categories, eq(categories.id, places.categoryId))
    .innerJoin(submitter, eq(submitter.id, submissions.submittedBy))
    .leftJoin(openedBy, eq(openedBy.id, submissions.reviewingBy))
    .leftJoin(decidedBy, eq(decidedBy.id, submissions.reviewedBy))
    .where(eq(submissions.id, submissionId));
  if (!row) return null;

  // The place's current assessment, to compare with (and, on approval, to merge with).
  const [current] = await db
    .select({ id: assessments.id, verifiedAt: assessments.verifiedAt, overallLevel: assessments.overallLevel })
    .from(assessments)
    .where(and(eq(assessments.placeId, row.place.id), eq(assessments.isCurrent, true), ne(assessments.id, row.assessment.id)));

  const [suggestion] = await db
    .select({ level: scoreSuggestions.level, explanation: scoreSuggestions.explanation })
    .from(scoreSuggestions)
    .where(and(eq(scoreSuggestions.submissionId, submissionId), eq(scoreSuggestions.strategy, "rules")))
    .orderBy(sql`${scoreSuggestions.createdAt} DESC`)
    .limit(1);

  const [submitted, currentResults, questionnaire] = await Promise.all([
    loadResults(row.assessment.id),
    current ? loadResults(current.id) : Promise.resolve(null),
    loadQuestionnaire(),
  ]);

  return { ...row, current: current ? { ...current, results: currentResults! } : null, submitted, suggestion, questionnaire };
}

/** The oldest pending submission other than `exceptId`, for "next in queue". */
export async function nextPendingSubmissionId(exceptId: string) {
  const [next] = await getDb()
    .select({ id: submissions.id })
    .from(submissions)
    .where(and(eq(submissions.status, "pending"), ne(submissions.id, exceptId)))
    .orderBy(asc(submissions.submittedAt))
    .limit(1);
  return next?.id ?? null;
}

// ---------------------------------------------------------------------------
// "Opened by Ana 5 minutes ago" (a warning, not a lock: docs/decisions.md)
// ---------------------------------------------------------------------------

/** Notes that this reviewer has the submission open. Not a data change, so not in the change log. */
export async function markOpened(reviewer: CurrentUser, submissionId: string) {
  await getDb()
    .update(submissions)
    .set({ reviewingBy: reviewer.id, reviewingSince: new Date() })
    .where(and(eq(submissions.id, submissionId), eq(submissions.status, "pending")));
}

// ---------------------------------------------------------------------------
// Deciding
// ---------------------------------------------------------------------------

/**
 * The change_log row for the decision, which also acts as a safety check.
 *
 * D1 can't stop halfway through a batch to check something. So this INSERT takes its
 * table_name from a lookup that only finds the submission if THIS decision was really saved
 * (same status, same reviewer, same timestamp). If someone else decided it a moment earlier,
 * the lookup finds nothing, table_name becomes NULL, the NOT NULL rule fails, and D1 cancels
 * the WHOLE batch, so nothing half-done is ever saved.
 */
function guardedDecisionLog(
  submissionId: string, status: "approved" | "rejected", reviewer: CurrentUser, at: Date, newRow: Record<string, unknown>,
) {
  const tableNameIfDecisionSaved = sql`(SELECT 'submissions' FROM submissions
    WHERE id = ${submissionId} AND status = ${status} AND reviewed_by = ${reviewer.id} AND reviewed_at = ${at.getTime()})`;
  return getDb()
    .insert(changeLog)
    .values({
      tableName: tableNameIfDecisionSaved,
      recordId: submissionId,
      action: "update",
      oldRow: { status: "pending" },
      newRow,
      changedBy: reviewer.id,
      changedAt: at,
    });
}

/** True for the database errors our safety rules cause (NOT NULL, UNIQUE, CHECK ...). */
function isConstraintError(error: unknown): boolean {
  const text = String(error instanceof Error ? `${error.message} ${error.cause ?? ""}` : error);
  return /constraint/i.test(text);
}

/** Splits rows so each INSERT stays under D1's limit of 100 values per statement. */
function chunks<T>(rows: T[], columns: number): T[][] {
  const size = Math.floor(100 / columns);
  return Array.from({ length: Math.ceil(rows.length / size) }, (_, i) => rows.slice(i * size, (i + 1) * size));
}

const DECISION_CONFLICT =
  "This couldn't be saved: someone else may have decided this submission, or the place changed in the meantime. Reload the page and check.";

async function runBatch(statements: BatchItem<"sqlite">[], conflictMessage = DECISION_CONFLICT) {
  try {
    await getDb().batch(statements as [BatchItem<"sqlite">, ...BatchItem<"sqlite">[]]);
  } catch (error) {
    console.error("Review batch failed", error);
    if (!isConstraintError(error)) throw error; // a bug, not a conflict: show it as one
    throw new ApprovalError(conflictMessage);
  }
}

export async function approveSubmission(
  reviewer: CurrentUser, submissionId: string, corrections: Record<string, Correction>, level: Level,
) {
  const db = getDb();

  // --- Read everything first ---
  const [row] = await db
    .select({ submission: submissions, assessment: assessments, place: places })
    .from(submissions)
    .innerJoin(assessments, eq(assessments.id, submissions.assessmentId))
    .innerJoin(places, eq(places.id, assessments.placeId))
    .where(eq(submissions.id, submissionId));
  if (!row) throw new ApprovalError("This submission doesn't exist.");
  if (row.submission.status !== "pending") throw new ApprovalError(`This submission was already ${row.submission.status}.`);

  const [current] = await db
    .select({ id: assessments.id })
    .from(assessments)
    .where(and(eq(assessments.placeId, row.place.id), eq(assessments.isCurrent, true)));

  const [submitted, currentResults, questionnaire] = await Promise.all([
    loadResults(row.assessment.id),
    current ? loadResults(current.id) : Promise.resolve(null),
    loadQuestionnaire(),
  ]);
  const questionsByCriterion: Record<string, QuestionInfo[]> = Object.fromEntries(
    questionnaire.map((c) => [c.code, c.questions.map((q) => ({ id: q.id, code: q.code, type: q.type, options: q.options }))]),
  );

  // --- Work out the changes (pure; see approval-plan.ts) ---
  const plan = planApproval({
    submitted,
    current: currentResults,
    questionsByCriterion,
    mandatory: questionnaire.filter((c) => c.isMandatory).map((c) => c.code),
    corrections,
    level,
  });

  // --- Then save them in one batch ---
  const now = new Date();
  const log = (tableName: string, recordId: string, oldRow: unknown, newRow: unknown) =>
    db.insert(changeLog).values({ tableName, recordId, action: "update", oldRow, newRow, changedBy: reviewer.id, changedAt: now });

  const statements: BatchItem<"sqlite">[] = [
    db
      .update(submissions)
      .set({ status: "approved", reviewedBy: reviewer.id, reviewedAt: now, editedByReviewer: plan.edited })
      .where(and(eq(submissions.id, submissionId), eq(submissions.status, "pending"))),
    guardedDecisionLog(submissionId, "approved", reviewer, now, { status: "approved", edited_by_reviewer: plan.edited }),
  ];

  // Corrections to the submitted answers
  for (const w of plan.answerWrites) {
    if (w.op === "update") statements.push(db.update(answers).set({ value: w.value }).where(eq(answers.id, w.id)));
    else if (w.op === "delete") statements.push(db.delete(answers).where(eq(answers.id, w.id)));
    else statements.push(db.insert(answers).values({ id: w.id, criterionResultId: w.criterionResultId, questionId: w.questionId, value: w.value }));
  }
  for (const w of plan.levelWrites) {
    statements.push(db.update(criterionResults).set({ level: w.level }).where(eq(criterionResults.id, w.resultId)));
  }
  if (plan.correctionLog) {
    statements.push(log("assessments", row.assessment.id, plan.correctionLog.before, plan.correctionLog.after));
  }

  // The old current assessment becomes history. If another approval made a different assessment
  // current meanwhile, the unique "one current per place" rule fails below and cancels the batch.
  if (current) {
    statements.push(
      db.update(assessments).set({ isCurrent: false }).where(and(eq(assessments.id, current.id), eq(assessments.isCurrent, true))),
      log("assessments", current.id, { is_current: true }, { is_current: false }),
    );
  }

  // Copy the unchanged criteria into the approved assessment
  for (const part of chunks(plan.copiedResults, 5)) {
    statements.push(db.insert(criterionResults).values(part.map((r) => ({ ...r, assessmentId: row.assessment.id, createdAt: now }))));
  }
  for (const part of chunks(plan.copiedAnswers, 4)) statements.push(db.insert(answers).values(part));
  for (const part of chunks(plan.copiedPhotos, 6)) statements.push(db.insert(photos).values(part));

  // The approved assessment becomes current
  statements.push(
    db
      .update(assessments)
      .set({ isCurrent: true, verifiedAt: now, overallLevel: level, basedOnId: current?.id ?? null })
      .where(eq(assessments.id, row.assessment.id)),
    log("assessments", row.assessment.id, { is_current: false }, { is_current: true, overall_level: level, based_on_id: current?.id ?? null }),
  );

  // The fields copied onto the place (published level only if the publishing rule is met)
  statements.push(
    db
      .update(places)
      .set({ publishedLevel: plan.place.publishedLevel, hasDesignatedParking: plan.place.hasDesignatedParking, lastVerifiedAt: now })
      .where(eq(places.id, row.place.id)),
    log(
      "places",
      row.place.id,
      { published_level: row.place.publishedLevel, has_designated_parking: row.place.hasDesignatedParking },
      { published_level: plan.place.publishedLevel, has_designated_parking: plan.place.hasDesignatedParking },
    ),
  );

  await runBatch(statements);
  return { published: plan.publishable, placeId: row.place.id };
}

export async function rejectSubmission(reviewer: CurrentUser, submissionId: string, reason: string) {
  const text = reason.trim();
  if (!text) throw new ApprovalError("Write a reason: the contributor will see it.");
  if (text.length > 1000) throw new ApprovalError("The reason can be at most 1000 characters.");

  const db = getDb();
  const [submission] = await db.select({ status: submissions.status }).from(submissions).where(eq(submissions.id, submissionId));
  if (!submission) throw new ApprovalError("This submission doesn't exist.");
  if (submission.status !== "pending") throw new ApprovalError(`This submission was already ${submission.status}.`);

  // Verified data is untouched: only the submission and its change_log row.
  const now = new Date();
  await runBatch([
    db
      .update(submissions)
      .set({ status: "rejected", rejectionReason: text, reviewedBy: reviewer.id, reviewedAt: now })
      .where(and(eq(submissions.id, submissionId), eq(submissions.status, "pending"))),
    guardedDecisionLog(submissionId, "rejected", reviewer, now, { status: "rejected", rejection_reason: text }),
  ]);
  // TODO(email): send the decision to the contributor once an email service is chosen (PRD R19, R24).
}

// ---------------------------------------------------------------------------
// Admin edits: correct a place's published assessment directly
// ---------------------------------------------------------------------------

/** What the "Edit accessibility" page shows: the place, its current assessment and the questionnaire. */
export async function loadForAdminEdit(placeId: string) {
  const db = getDb();
  const [place] = await db
    .select({
      id: places.id,
      name: places.name,
      address: places.address,
      publishedLevel: places.publishedLevel,
      hasDesignatedParking: places.hasDesignatedParking,
      lastVerifiedAt: places.lastVerifiedAt,
      status: places.status,
    })
    .from(places)
    .where(eq(places.id, placeId));
  if (!place) return null;
  const [current] = await db
    .select({ id: assessments.id, overallLevel: assessments.overallLevel, verifiedAt: assessments.verifiedAt })
    .from(assessments)
    .where(and(eq(assessments.placeId, placeId), eq(assessments.isCurrent, true)));
  const [results, questionnaire] = await Promise.all([
    current ? loadResults(current.id) : Promise.resolve([]),
    loadQuestionnaire(),
  ]);
  return { place, current: current ? { ...current, results } : null, questionnaire };
}

/**
 * Saves an admin's corrections as a NEW current assessment (origin "admin_edit"), built by the
 * same steps as an approval (planAdminEdit -> planApproval). The old assessment stays as history.
 *
 * `expectedCurrentId` is the current assessment the admin saw when the page opened: if another
 * approval or edit replaced it since, nothing is saved. Inside the batch, the database's
 * "one current assessment per place" rule catches the same thing at the very last moment.
 *
 * `newVisit`: the place was checked in person, so "last verified" moves to today. A desk
 * correction (e.g. a wrong answer typed in) keeps the old date, so the place doesn't jump out
 * of the "longest since verified" list without anyone having looked at it.
 */
export async function saveAdminEdit(
  admin: CurrentUser,
  placeId: string,
  answersByCriterion: Record<string, Correction>,
  level: Level,
  options: { expectedCurrentId: string | null; newVisit: boolean; note: string },
) {
  const note = options.note.trim();
  if (note.length > 1000) throw new ApprovalError("The note can be at most 1000 characters.");

  const data = await loadForAdminEdit(placeId);
  if (!data) throw new ApprovalError("This place no longer exists.");
  const { place, current, questionnaire } = data;
  if ((current?.id ?? null) !== options.expectedCurrentId) {
    throw new ApprovalError("This place's assessment changed since you opened the page (an approval or another edit). Reload the page and check.");
  }

  const plan = planAdminEdit({
    current: current?.results ?? null,
    criterionIds: Object.fromEntries(questionnaire.map((c) => [c.code, c.id])),
    questionsByCriterion: Object.fromEntries(
      questionnaire.map((c) => [c.code, c.questions.map((q) => ({ id: q.id, code: q.code, type: q.type, options: q.options }))]),
    ),
    mandatory: questionnaire.filter((c) => c.isMandatory).map((c) => c.code),
    answers: answersByCriterion,
    level,
  });
  if (plan.changed.length === 0 && level === current?.overallLevel && !options.newVisit) {
    throw new ApprovalError("Nothing changed: no answer or level is different from what's published.");
  }

  const db = getDb();
  const now = new Date();
  const assessmentId = crypto.randomUUID();
  const lastVerifiedAt = options.newVisit || !place.lastVerifiedAt ? now : place.lastVerifiedAt;
  const log = (tableName: string, recordId: string, action: "insert" | "update", oldRow: unknown, newRow: unknown) =>
    db.insert(changeLog).values({ tableName, recordId, action, oldRow, newRow, changedBy: admin.id, changedAt: now });

  const statements: BatchItem<"sqlite">[] = [];

  // The old current assessment becomes history.
  if (current) {
    statements.push(
      db.update(assessments).set({ isCurrent: false }).where(and(eq(assessments.id, current.id), eq(assessments.isCurrent, true))),
      log("assessments", current.id, "update", { is_current: true }, { is_current: false }),
    );
  }

  // The new assessment, current straight away. If another assessment became current meanwhile,
  // the "one current per place" rule fails here and D1 cancels the whole batch.
  statements.push(
    db.insert(assessments).values({
      id: assessmentId,
      placeId,
      origin: "admin_edit",
      basedOnId: current?.id ?? null,
      overallLevel: level,
      isCurrent: true,
      verifiedAt: now,
      createdAt: now,
    }),
    log("assessments", assessmentId, "insert", null, {
      origin: "admin_edit",
      overall_level: level,
      based_on_id: current?.id ?? null,
      ...(note ? { note } : {}),
      ...(options.newVisit ? { new_visit: true } : {}),
    }),
  );
  if (plan.log) statements.push(log("assessments", assessmentId, "update", plan.log.before, plan.log.after));

  // Its criteria: the admin's changed ones, then the copies of the rest.
  const results = [...plan.newResults, ...plan.copiedResults].map((r) => ({ ...r, assessmentId, createdAt: now }));
  for (const part of chunks(results, 5)) statements.push(db.insert(criterionResults).values(part));
  for (const part of chunks([...plan.newAnswers, ...plan.copiedAnswers], 4)) statements.push(db.insert(answers).values(part));
  for (const part of chunks([...plan.newPhotos, ...plan.copiedPhotos], 6)) statements.push(db.insert(photos).values(part));

  // The fields copied onto the place (published level only if the publishing rule is met).
  statements.push(
    db
      .update(places)
      .set({ publishedLevel: plan.place.publishedLevel, hasDesignatedParking: plan.place.hasDesignatedParking, lastVerifiedAt })
      .where(eq(places.id, placeId)),
    log(
      "places",
      placeId,
      "update",
      { published_level: place.publishedLevel, has_designated_parking: place.hasDesignatedParking, last_verified_at: place.lastVerifiedAt },
      { published_level: plan.place.publishedLevel, has_designated_parking: plan.place.hasDesignatedParking, last_verified_at: lastVerifiedAt },
    ),
  );

  await runBatch(
    statements,
    "This couldn't be saved: the place's assessment changed in the meantime (an approval or another edit). Reload the page and check.",
  );
  return { published: plan.publishable };
}
