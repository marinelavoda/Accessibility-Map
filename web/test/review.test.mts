// Run with `npm test`. Scoring rules, publishing rule and the approval plan.

import assert from "node:assert/strict";
import { test } from "node:test";
import { ApprovalError, planApproval, type QuestionInfo, type StoredResult } from "../src/server/approval-plan.ts";
import { levelFromMainAnswer, suggestLevel, type AnswerMap } from "../src/lib/scoring.ts";

const MANDATORY = ["access_until_entering", "ramp", "entrance_doors", "interior_space", "adapted_toilet", "designated_parking"];

/** Builds an AnswerMap from { criterion: "mainAnswer" } plus optional checkbox details. */
function answers(mains: Record<string, string>, details: Record<string, string[]> = {}): AnswerMap {
  return Object.fromEntries(
    Object.entries(mains).map(([code, main]) => [code, { level: levelFromMainAnswer(main), main, details: details[code] }]),
  );
}

// --- Scoring: the suggestions stored in the sample data must come out of the rules ---

test("theatre: no adapted toilet -> partially accessible, parking note", () => {
  const s = suggestLevel(
    answers({ access_until_entering: "accessible", ramp: "not_needed", entrance_doors: "wide", interior_space: "accessible",
      adapted_toilet: "no", elevator: "yes", designated_parking: "no" }),
    MANDATORY,
  );
  assert.deepEqual(s, { level: "partial", reasons: ["no_adapted_toilet"], notes: ["no_designated_parking"] });
});

test("hospital: stairs + ramp with metal wheel tracks -> accessible, two notes", () => {
  const s = suggestLevel(
    answers({ access_until_entering: "inaccessible", ramp: "yes", entrance_doors: "wide", interior_space: "accessible",
      adapted_toilet: "yes", elevator: "yes", designated_parking: "yes" },
      { access_until_entering: ["stairs"], ramp: ["concrete", "handrail", "metal_wheel_tracks"] }),
    MANDATORY,
  );
  assert.deepEqual(s, { level: "accessible", reasons: [], notes: ["ramp_makes_entrance_passable", "ramp_metal_wheel_tracks"] });
});

test("entry path only, all positive -> accessible but not enough to publish", () => {
  const s = suggestLevel(answers({ access_until_entering: "accessible", ramp: "not_needed", entrance_doors: "wide" }), MANDATORY);
  assert.deepEqual(s, { level: "accessible", reasons: [], notes: ["not_enough_to_publish"] });
});

test("stairs and no ramp -> inaccessible, publishable with the entry path alone", () => {
  const s = suggestLevel(answers({ access_until_entering: "inaccessible", ramp: "no", entrance_doors: "wide" }, { access_until_entering: ["stairs"] }), MANDATORY);
  assert.deepEqual(s, { level: "inaccessible", reasons: ["steps_without_ramp"], notes: [] });
});

test("'other' barrier -> inaccessible, reviewer must read the notes", () => {
  const s = suggestLevel(answers({ access_until_entering: "inaccessible", ramp: "yes", entrance_doors: "wide" }, { access_until_entering: ["other"] }), MANDATORY);
  assert.equal(s.level, "inaccessible");
  assert.ok(s.notes.includes("other_barrier_read_notes"));
});

test("accessible way in but 'ramp: no' -> contradiction note", () => {
  const s = suggestLevel(answers({ access_until_entering: "accessible", ramp: "no", entrance_doors: "wide" }), MANDATORY);
  assert.ok(s.notes.includes("contradictory_answers"));
});

test("parking never changes the level", () => {
  const base = { access_until_entering: "accessible", ramp: "not_needed", entrance_doors: "wide", interior_space: "accessible", adapted_toilet: "yes" };
  assert.equal(suggestLevel(answers({ ...base, designated_parking: "yes" }), MANDATORY).level, "accessible");
  assert.equal(suggestLevel(answers({ ...base, designated_parking: "no" }), MANDATORY).level, "accessible");
});

test("imported data with levels but no answers is still scored", () => {
  const s = suggestLevel(
    { access_until_entering: { level: "accessible" }, ramp: { level: "not_applicable" }, entrance_doors: { level: "inaccessible" } },
    MANDATORY,
  );
  assert.deepEqual(s.reasons, ["narrow_entrance_doors"]);
});

// --- The approval plan ---

const opts = (...codes: string[]) => codes.map((code) => ({ code }));
const Q: Record<string, QuestionInfo[]> = {
  access_until_entering: [
    { id: "q_access_main", code: "main", type: "choice", options: opts("accessible", "inaccessible") },
    { id: "q_access_barriers", code: "barriers", type: "checkboxes", options: opts("curb", "stairs", "other") },
    { id: "q_access_notes", code: "notes", type: "text", options: null },
  ],
  ramp: [
    { id: "q_ramp_main", code: "main", type: "choice", options: opts("yes", "no", "not_needed") },
    { id: "q_ramp_notes", code: "notes", type: "text", options: null },
  ],
  entrance_doors: [
    { id: "q_doors_main", code: "main", type: "choice", options: opts("wide", "narrow") },
    { id: "q_doors_notes", code: "notes", type: "text", options: null },
  ],
  interior_space: [{ id: "q_interior_main", code: "main", type: "choice", options: opts("accessible", "inaccessible") }],
  adapted_toilet: [{ id: "q_toilet_main", code: "main", type: "choice", options: opts("yes", "no", "no_public_toilet") }],
  designated_parking: [{ id: "q_parking_main", code: "main", type: "choice", options: opts("yes", "no") }],
};

/** A stored criterion result with only a main answer. */
function result(id: string, code: string, main: string, photos = 0): StoredResult {
  return {
    id, criterionId: `crit_${code}`, criterionCode: code, level: levelFromMainAnswer(main),
    answers: [{ id: `${id}_main`, questionId: Q[code][0].id, value: main }],
    photos: Array.from({ length: photos }, (_, i) => ({ id: `${id}_p${i}`, r2Key: `k/${id}/${i}`, position: i + 1, uploadedBy: "u", createdAt: new Date(0) })),
  };
}

let counter = 0;
const newId = () => `new_${++counter}`;

test("entry path only, accessible -> answers saved but the place stays unrated", () => {
  const plan = planApproval({
    submitted: [result("r1", "access_until_entering", "accessible"), result("r2", "ramp", "not_needed"), result("r3", "entrance_doors", "wide")],
    current: null, questionsByCriterion: Q, mandatory: MANDATORY, corrections: {}, level: "accessible", newId,
  });
  assert.equal(plan.publishable, false);
  assert.equal(plan.place.publishedLevel, null);
  assert.equal(plan.edited, false);
});

test("entry path only, inaccessible -> published", () => {
  const plan = planApproval({
    submitted: [result("r1", "access_until_entering", "inaccessible"), result("r2", "ramp", "no"), result("r3", "entrance_doors", "wide")],
    current: null, questionsByCriterion: Q, mandatory: MANDATORY, corrections: {}, level: "inaccessible", newId,
  });
  assert.equal(plan.place.publishedLevel, "inaccessible");
});

test("an update is merged with the unchanged criteria of the current assessment", () => {
  const current = [
    result("c1", "access_until_entering", "accessible", 1), result("c2", "ramp", "not_needed"), result("c3", "entrance_doors", "wide"),
    result("c4", "interior_space", "accessible"), result("c5", "adapted_toilet", "no_public_toilet"), result("c6", "designated_parking", "no"),
  ];
  const plan = planApproval({
    submitted: [result("u1", "entrance_doors", "narrow")],
    current, questionsByCriterion: Q, mandatory: MANDATORY, corrections: {}, level: "inaccessible", newId,
  });
  // Everything except the entrance doors is copied; the doors come from the update.
  assert.deepEqual(plan.copiedResults.map((r) => r.criterionId).sort(),
    ["crit_access_until_entering", "crit_adapted_toilet", "crit_designated_parking", "crit_interior_space", "crit_ramp"]);
  assert.equal(plan.merged.entrance_doors.main, "narrow");
  assert.equal(plan.copiedPhotos.length, 1);
  assert.equal(plan.copiedPhotos[0].r2Key, "k/c1/0"); // same file, new row
  assert.notEqual(plan.copiedPhotos[0].id, "c1_p0");
  assert.equal(plan.place.publishedLevel, "inaccessible");
  assert.equal(plan.place.hasDesignatedParking, false);
});

test("a correction changes the answer, the criterion level, and is logged", () => {
  const plan = planApproval({
    submitted: [result("r3", "entrance_doors", "narrow")],
    current: null, questionsByCriterion: Q, mandatory: MANDATORY,
    corrections: { entrance_doors: { main: "wide", notes: "80 cm, not 8" } }, level: "accessible", newId,
  });
  assert.equal(plan.edited, true);
  assert.deepEqual(plan.answerWrites[0], { op: "update", id: "r3_main", value: "wide" });
  assert.equal(plan.answerWrites[1].op, "insert"); // the new note
  assert.deepEqual(plan.levelWrites, [{ resultId: "r3", level: "accessible" }]);
  assert.deepEqual(plan.correctionLog, {
    before: { "entrance_doors.main": "narrow", "entrance_doors.notes": null },
    after: { "entrance_doors.main": "wide", "entrance_doors.notes": "80 cm, not 8" },
  });
});

test("the form can't add a criterion or an answer that doesn't exist", () => {
  const base = { current: null, questionsByCriterion: Q, mandatory: MANDATORY, level: "accessible" as const, newId };
  const submitted = [result("r3", "entrance_doors", "wide")];
  assert.throws(() => planApproval({ ...base, submitted, corrections: { adapted_toilet: { main: "yes" } } }), ApprovalError);
  assert.throws(() => planApproval({ ...base, submitted, corrections: { entrance_doors: { main: "huge" } } }), ApprovalError);
  assert.throws(() => planApproval({ ...base, submitted, corrections: { entrance_doors: {} } }), ApprovalError);
});
