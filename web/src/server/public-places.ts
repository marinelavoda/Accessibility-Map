// Read-only queries for what the PUBLIC may see (hard rule 2 in CLAUDE.md):
// active places, and for places with a published level, their current (approved) assessment.
// Pending, rejected and hidden data never leaves this file.

import { and, asc, eq, isNotNull, sql } from "drizzle-orm";
import { getDb } from "@/db";
import {
  answers,
  assessments,
  categories,
  criteria,
  criterionResults,
  places,
  questions,
  type AnswerValue,
  type QuestionOption,
  type Translated,
} from "@/db/schema";

export type PublicCriterion = {
  name: Translated;
  level: (typeof criterionResults.$inferSelect)["level"];
  answer?: Translated; // the main answer, e.g. "Not needed (step-free entrance)"
  details: Translated[]; // checkbox answers, e.g. barriers or ramp surface
  notes?: string;
};

export type PublicPlace = {
  id: string;
  name: string;
  address: string | null;
  category: Translated;
  level: (typeof places.$inferSelect)["publishedLevel"];
  hasDesignatedParking: boolean | null;
  lastVerifiedAt: Date | null;
  criteria: PublicCriterion[];
};

/** Conditions shared by every query below: only the current assessment of a published, active place. */
const publishedCurrentAssessment = and(
  eq(assessments.isCurrent, true),
  eq(places.status, "active"),
  isNotNull(places.publishedLevel),
);

export async function listPublicPlaces(): Promise<PublicPlace[]> {
  const db = getDb();

  // 1. Every active place: rated ones first, then alphabetical.
  const placeRows = await db
    .select({
      id: places.id,
      name: places.name,
      address: places.address,
      category: categories.name,
      level: places.publishedLevel,
      hasDesignatedParking: places.hasDesignatedParking,
      lastVerifiedAt: places.lastVerifiedAt,
    })
    .from(places)
    .innerJoin(categories, eq(categories.id, places.categoryId))
    .where(eq(places.status, "active"))
    .orderBy(sql`${places.publishedLevel} IS NULL`, asc(places.name));

  // 2. The criterion results of published places' current assessments.
  const resultRows = await db
    .select({
      resultId: criterionResults.id,
      placeId: assessments.placeId,
      name: criteria.name,
      level: criterionResults.level,
    })
    .from(criterionResults)
    .innerJoin(assessments, eq(assessments.id, criterionResults.assessmentId))
    .innerJoin(places, eq(places.id, assessments.placeId))
    .innerJoin(criteria, eq(criteria.id, criterionResults.criterionId))
    .where(publishedCurrentAssessment)
    .orderBy(asc(criteria.displayOrder));

  // 3. The answers behind those results (imported assessments may have none).
  const answerRows = await db
    .select({
      resultId: answers.criterionResultId,
      questionType: questions.type,
      isMain: questions.isMain,
      options: questions.options,
      value: answers.value,
    })
    .from(answers)
    .innerJoin(questions, eq(questions.id, answers.questionId))
    .innerJoin(criterionResults, eq(criterionResults.id, answers.criterionResultId))
    .innerJoin(assessments, eq(assessments.id, criterionResults.assessmentId))
    .innerJoin(places, eq(places.id, assessments.placeId))
    .where(publishedCurrentAssessment);

  // Put the pieces together.
  const criteriaByResult = new Map<string, PublicCriterion>();
  const criteriaByPlace = new Map<string, PublicCriterion[]>();
  for (const r of resultRows) {
    const criterion: PublicCriterion = { name: r.name, level: r.level, details: [] };
    criteriaByResult.set(r.resultId, criterion);
    criteriaByPlace.set(r.placeId, [...(criteriaByPlace.get(r.placeId) ?? []), criterion]);
  }
  for (const a of answerRows) {
    const criterion = criteriaByResult.get(a.resultId);
    if (!criterion) continue;
    if (a.questionType === "text") criterion.notes = String(a.value);
    else if (a.isMain) criterion.answer = optionLabel(a.options, a.value);
    else criterion.details = toList(a.value).map((code) => optionLabel(a.options, code));
  }

  return placeRows.map((p) => ({ ...p, criteria: criteriaByPlace.get(p.id) ?? [] }));
}

/** Turns an option code like "not_needed" into its label, falling back to the code itself. */
function optionLabel(options: QuestionOption[] | null, value: AnswerValue): Translated {
  const code = String(value);
  return options?.find((o) => o.code === code)?.label ?? { ro: code, en: code };
}

function toList(value: AnswerValue): string[] {
  return Array.isArray(value) ? value : [value];
}
