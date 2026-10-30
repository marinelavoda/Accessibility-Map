// Works out WHAT approving a submission changes, without touching the database.
// ./review.ts loads the data, calls planApproval(), then saves the plan in one batch.
// Keeping this part pure means the publishing rules can be tested directly (test/review.test.mts).
//
// Approving (docs/decisions.md, "Submissions and review"):
//   1. apply the reviewer's corrections to the submitted answers;
//   2. copy the criteria the submission didn't cover from the place's current assessment,
//      so the approved assessment is complete (it becomes the new current one);
//   3. publish the reviewer's level only if the publishing rule is met.

import { isPublishable, levelFromMainAnswer, type AnswerMap, type Level, type ResultLevel } from "../lib/scoring.ts";

export type QuestionInfo = {
  id: string;
  code: string; // "main", "barriers", "surface", "notes"
  type: "choice" | "checkboxes" | "text";
  options: { code: string }[] | null;
};

export type StoredAnswer = { id: string; questionId: string; value: string | string[] };
export type StoredPhoto = { id: string; r2Key: string; position: number; uploadedBy: string | null; createdAt: Date };

export type StoredResult = {
  id: string;
  criterionId: string;
  criterionCode: string;
  level: ResultLevel;
  answers: StoredAnswer[];
  photos: StoredPhoto[];
};

/** What the reviewer's form sends for one criterion. */
export type Correction = { main?: string; details?: string[]; notes?: string };

export type ApprovalInput = {
  submitted: StoredResult[]; // the submission's own criterion results
  current: StoredResult[] | null; // the place's current assessment, if it has one
  questionsByCriterion: Record<string, QuestionInfo[]>; // criterion code -> its questions
  mandatory: string[]; // codes of the mandatory criteria
  corrections: Record<string, Correction>; // criterion code -> corrected answers
  level: Level; // the level the reviewer chose
  newId?: () => string;
};

export class ApprovalError extends Error {}

export function planApproval(input: ApprovalInput) {
  const newId = input.newId ?? (() => crypto.randomUUID());
  const answerWrites: (
    | { op: "insert"; id: string; criterionResultId: string; questionId: string; value: string | string[] }
    | { op: "update"; id: string; value: string | string[] }
    | { op: "delete"; id: string }
  )[] = [];
  const levelWrites: { resultId: string; level: ResultLevel }[] = [];
  const logBefore: Record<string, unknown> = {};
  const logAfter: Record<string, unknown> = {};
  const merged: AnswerMap = {};

  // --- 1. Corrections to the submitted criteria ---
  const submittedCodes = new Set(input.submitted.map((r) => r.criterionCode));
  for (const code of Object.keys(input.corrections)) {
    if (!submittedCodes.has(code)) throw new ApprovalError(`“${code}” isn't part of this submission.`);
  }

  for (const result of input.submitted) {
    const questions = input.questionsByCriterion[result.criterionCode] ?? [];
    const correction = input.corrections[result.criterionCode];
    const stored = new Map(result.answers.map((a) => [a.questionId, a]));
    let level = result.level;

    for (const question of questions) {
      const old = stored.get(question.id);
      const proposed = correction ? valueFromCorrection(question, correction) : old?.value;
      const key = `${result.criterionCode}.${question.code}`;
      if (sameValue(old?.value, proposed)) continue;

      if (proposed === undefined) answerWrites.push({ op: "delete", id: old!.id });
      else if (old) answerWrites.push({ op: "update", id: old.id, value: proposed });
      else answerWrites.push({ op: "insert", id: newId(), criterionResultId: result.id, questionId: question.id, value: proposed });
      logBefore[key] = old?.value ?? null;
      logAfter[key] = proposed ?? null;

      if (question.code === "main" && typeof proposed === "string") {
        level = levelFromMainAnswer(proposed);
        if (level !== result.level) levelWrites.push({ resultId: result.id, level });
      }
    }

    // The answers as they will be after the corrections, for the publishing rule.
    const finalValue = (questionCode: string) => {
      const question = questions.find((q) => q.code === questionCode);
      if (!question) return undefined;
      return correction ? valueFromCorrection(question, correction) : stored.get(question.id)?.value;
    };
    const main = finalValue("main");
    const details = questions.find((q) => q.type === "checkboxes");
    merged[result.criterionCode] = {
      level,
      main: typeof main === "string" ? main : undefined,
      details: details ? (finalValue(details.code) as string[] | undefined) : undefined,
    };
  }

  // --- 2. Copy the criteria this submission didn't cover from the current assessment ---
  const copiedResults: { id: string; criterionId: string; level: ResultLevel }[] = [];
  const copiedAnswers: { id: string; criterionResultId: string; questionId: string; value: string | string[] }[] = [];
  const copiedPhotos: (StoredPhoto & { criterionResultId: string })[] = [];

  for (const result of input.current ?? []) {
    if (submittedCodes.has(result.criterionCode)) continue; // replaced by the submission
    const resultId = newId();
    copiedResults.push({ id: resultId, criterionId: result.criterionId, level: result.level });
    for (const a of result.answers) copiedAnswers.push({ id: newId(), criterionResultId: resultId, questionId: a.questionId, value: a.value });
    // Same R2 file, new photo row (photos.r2_key is deliberately not unique).
    for (const p of result.photos) copiedPhotos.push({ ...p, id: newId(), criterionResultId: resultId });

    const questions = input.questionsByCriterion[result.criterionCode] ?? [];
    const valueOf = (code: string) => result.answers.find((a) => a.questionId === questions.find((q) => q.code === code)?.id)?.value;
    const main = valueOf("main");
    const details = questions.find((q) => q.type === "checkboxes");
    merged[result.criterionCode] = {
      level: result.level,
      main: typeof main === "string" ? main : undefined,
      details: details ? (valueOf(details.code) as string[] | undefined) : undefined,
    };
  }

  // --- 3. The publishing rule and the fields copied onto the place ---
  const publishable = isPublishable(merged, input.level, input.mandatory);
  const parking = merged.designated_parking;

  return {
    answerWrites,
    levelWrites,
    edited: answerWrites.length > 0,
    correctionLog: answerWrites.length > 0 ? { before: logBefore, after: logAfter } : null,
    copiedResults,
    copiedAnswers,
    copiedPhotos,
    merged,
    publishable,
    place: {
      publishedLevel: publishable ? input.level : null,
      hasDesignatedParking: parking ? parking.level === "accessible" : null,
    },
  };
}

/** Checks one answer from the form against the question, and returns what to store. */
function valueFromCorrection(question: QuestionInfo, correction: Correction): string | string[] | undefined {
  const allowed = new Set(question.options?.map((o) => o.code));
  if (question.code === "main") {
    if (!correction.main || !allowed.has(correction.main)) throw new ApprovalError("Choose an answer for every criterion.");
    return correction.main;
  }
  if (question.type === "checkboxes") {
    const picked = correction.details ?? [];
    if (picked.some((code) => !allowed.has(code))) throw new ApprovalError("Unknown checkbox answer.");
    return picked.length ? [...new Set(picked)] : undefined;
  }
  // Free-text notes: empty means "no notes".
  const notes = (correction.notes ?? "").trim();
  if (notes.length > 2000) throw new ApprovalError("Notes can be at most 2000 characters.");
  return notes || undefined;
}

function sameValue(a: string | string[] | undefined, b: string | string[] | undefined): boolean {
  return JSON.stringify(Array.isArray(a) ? [...a].sort() : a) === JSON.stringify(Array.isArray(b) ? [...b].sort() : b);
}
