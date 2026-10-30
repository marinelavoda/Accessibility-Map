// The data behind each CSV download (PRD R30). Admins only: the API route calls
// requireRoleForApi("admin") before any of these run.
//
// Exports include everything (also pending, rejected and hidden data), so the team can
// reuse it. People appear only as user IDs, never names or emails: a CSV gets copied and
// emailed around, and personal data shouldn't travel with it.

import { asc, eq } from "drizzle-orm";
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
  type AnswerValue,
  type QuestionOption,
} from "@/db/schema";

type Table = { headers: string[]; rows: (string | number | boolean | Date | null)[][] };

export const EXPORTS = {
  places: {
    title: "Places",
    description: "Every place, including hidden ones, with its published level and location.",
    load: exportPlaces,
  },
  assessments: {
    title: "Assessments",
    description: "Every assessment of every place: current, older, pending and rejected.",
    load: exportAssessments,
  },
  answers: {
    title: "Answers",
    description: "One row per answer: criterion, level, and the answer in Romanian and English.",
    load: exportAnswers,
  },
  submissions: {
    title: "Submissions",
    description: "Every submission and the review decision, with the suggested level.",
    load: exportSubmissions,
  },
  photos: {
    title: "Photos",
    description: "Which photo belongs to which criterion. Links are added once photo storage is set up.",
    load: exportPhotos,
  },
  "change-log": {
    title: "Change history",
    description: "Every change to the data: what, when, and the ID of who made it.",
    load: exportChangeLog,
  },
} satisfies Record<string, { title: string; description: string; load: () => Promise<Table> }>;

export type ExportName = keyof typeof EXPORTS;

export function isExportName(value: string): value is ExportName {
  return Object.hasOwn(EXPORTS, value);
}

async function exportPlaces(): Promise<Table> {
  const rows = await getDb()
    .select({ place: places, category: categories.code })
    .from(places)
    .innerJoin(categories, eq(categories.id, places.categoryId))
    .orderBy(asc(places.name));
  return {
    headers: [
      "place_id", "name", "category", "address", "lat", "lng", "status", "source", "osm_type", "osm_id",
      "osm_tag", "published_level", "has_designated_parking", "last_verified_at", "created_at",
    ],
    rows: rows.map(({ place: p, category }) => [
      p.id, p.name, category, p.address, p.lat, p.lng, p.status, p.source, p.osmType, p.osmId,
      p.osmTag, p.publishedLevel, p.hasDesignatedParking, p.lastVerifiedAt, p.createdAt,
    ]),
  };
}

async function exportAssessments(): Promise<Table> {
  const rows = await getDb()
    .select({ a: assessments, placeName: places.name, submissionStatus: submissions.status })
    .from(assessments)
    .innerJoin(places, eq(places.id, assessments.placeId))
    .leftJoin(submissions, eq(submissions.assessmentId, assessments.id))
    .orderBy(asc(places.name), asc(assessments.createdAt));
  return {
    headers: [
      "assessment_id", "place_id", "place_name", "origin", "submission_status", "overall_level",
      "is_current", "based_on_id", "verified_at", "created_at",
    ],
    rows: rows.map(({ a, placeName, submissionStatus }) => [
      a.id, a.placeId, placeName, a.origin, submissionStatus, a.overallLevel,
      a.isCurrent, a.basedOnId, a.verifiedAt, a.createdAt,
    ]),
  };
}

async function exportAnswers(): Promise<Table> {
  const rows = await getDb()
    .select({
      assessmentId: assessments.id,
      placeId: places.id,
      placeName: places.name,
      isCurrent: assessments.isCurrent,
      criterion: criteria.code,
      criterionLevel: criterionResults.level,
      question: questions.code,
      questionType: questions.type,
      options: questions.options,
      value: answers.value,
    })
    .from(answers)
    .innerJoin(questions, eq(questions.id, answers.questionId))
    .innerJoin(criterionResults, eq(criterionResults.id, answers.criterionResultId))
    .innerJoin(criteria, eq(criteria.id, criterionResults.criterionId))
    .innerJoin(assessments, eq(assessments.id, criterionResults.assessmentId))
    .innerJoin(places, eq(places.id, assessments.placeId))
    .orderBy(asc(places.name), asc(assessments.createdAt), asc(criteria.displayOrder), asc(questions.displayOrder));
  return {
    headers: [
      "assessment_id", "place_id", "place_name", "is_current_assessment", "criterion", "criterion_level",
      "question", "answer", "answer_ro", "answer_en",
    ],
    rows: rows.map((r) => {
      const label = (lang: "ro" | "en") =>
        r.questionType === "text" ? String(r.value) : labels(r.options, r.value, lang);
      const codes = Array.isArray(r.value) ? r.value.join("; ") : String(r.value);
      return [
        r.assessmentId, r.placeId, r.placeName, r.isCurrent, r.criterion, r.criterionLevel,
        r.question, codes, label("ro"), label("en"),
      ];
    }),
  };
}

async function exportSubmissions(): Promise<Table> {
  const rows = await getDb()
    .select({ s: submissions, placeId: places.id, placeName: places.name, suggested: scoreSuggestions.level })
    .from(submissions)
    .innerJoin(assessments, eq(assessments.id, submissions.assessmentId))
    .innerJoin(places, eq(places.id, assessments.placeId))
    .leftJoin(scoreSuggestions, eq(scoreSuggestions.submissionId, submissions.id))
    .orderBy(asc(submissions.submittedAt));
  return {
    headers: [
      "submission_id", "assessment_id", "place_id", "place_name", "kind", "status", "suggested_level",
      "submitted_by_user_id", "submitted_at", "reviewed_by_user_id", "reviewed_at", "rejection_reason",
      "edited_by_reviewer",
    ],
    rows: rows.map(({ s, placeId, placeName, suggested }) => [
      s.id, s.assessmentId, placeId, placeName, s.kind, s.status, suggested,
      s.submittedBy, s.submittedAt, s.reviewedBy, s.reviewedAt, s.rejectionReason,
      s.editedByReviewer,
    ]),
  };
}

async function exportPhotos(): Promise<Table> {
  const rows = await getDb()
    .select({ p: photos, assessmentId: assessments.id, placeName: places.name, criterion: criteria.code })
    .from(photos)
    .innerJoin(criterionResults, eq(criterionResults.id, photos.criterionResultId))
    .innerJoin(criteria, eq(criteria.id, criterionResults.criterionId))
    .innerJoin(assessments, eq(assessments.id, criterionResults.assessmentId))
    .innerJoin(places, eq(places.id, assessments.placeId))
    .orderBy(asc(places.name), asc(criteria.displayOrder), asc(photos.position));
  return {
    headers: ["photo_id", "assessment_id", "place_name", "criterion", "position", "storage_key", "created_at"],
    rows: rows.map(({ p, assessmentId, placeName, criterion }) => [
      p.id, assessmentId, placeName, criterion, p.position, p.r2Key, p.createdAt,
    ]),
  };
}

async function exportChangeLog(): Promise<Table> {
  const rows = await getDb().select().from(changeLog).orderBy(asc(changeLog.id));
  return {
    headers: ["change_id", "table_name", "record_id", "action", "old_row", "new_row", "changed_by_user_id", "changed_at"],
    rows: rows.map((c) => [
      c.id, c.tableName, c.recordId, c.action,
      c.oldRow === null ? null : JSON.stringify(c.oldRow),
      c.newRow === null ? null : JSON.stringify(c.newRow),
      c.changedBy, c.changedAt,
    ]),
  };
}

/** "stairs; curb" -> "Scări; Bordură" using the question's options. */
function labels(options: QuestionOption[] | null, value: AnswerValue, lang: "ro" | "en"): string {
  const codes = Array.isArray(value) ? value : [value];
  return codes.map((code) => options?.find((o) => o.code === code)?.label[lang] ?? code).join("; ");
}
