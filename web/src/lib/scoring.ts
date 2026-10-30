// The scoring rules and the publishing rule from docs/criteria-and-rules.md.
//
// The rules only SUGGEST a level (hard rule 6); a reviewer always decides.
// This file has no imports, so it runs both on the server and in the browser
// (the review page recalculates the suggestion while a reviewer corrects answers).

export const LEVELS = ["accessible", "partial", "inaccessible"] as const;
export type Level = (typeof LEVELS)[number];
export type ResultLevel = Level | "not_applicable";

/** What is known about one criterion. Imported assessments may have a level but no answers. */
export type CriterionAnswers = {
  level: ResultLevel;
  main?: string; // the main answer's option code, e.g. "yes", "narrow", "not_needed"
  details?: string[]; // checkbox codes, e.g. barriers ["stairs"] or ramp surface ["metal_wheel_tracks"]
  notes?: string;
};

/** Criterion code -> what is known. A missing criterion is "not assessed". */
export type AnswerMap = Record<string, CriterionAnswers>;

export type Suggestion = { level: Level; reasons: string[]; notes: string[] };

/** Criteria 1–3: enough to publish "inaccessible". */
export const ENTRY_PATH = ["access_until_entering", "ramp", "entrance_doors"];

const POSITIVE = ["accessible", "yes", "wide"];
const NOT_APPLICABLE = ["not_needed", "no_public_toilet", "not_applicable"];

/** A criterion's level comes from its main answer: Yes/Wide/Accessible, Not needed/N/A, or negative. */
export function levelFromMainAnswer(main: string): ResultLevel {
  if (POSITIVE.includes(main)) return "accessible";
  if (NOT_APPLICABLE.includes(main)) return "not_applicable";
  return "inaccessible";
}

/** The publishing rule (PRD R33). `mandatory` = codes of the 6 mandatory criteria. */
export function isPublishable(answers: AnswerMap, level: Level, mandatory: string[]): boolean {
  const needed = level === "inaccessible" ? ENTRY_PATH : mandatory;
  return needed.every((code) => code in answers);
}

export function suggestLevel(answers: AnswerMap, mandatory: string[]): Suggestion {
  const reasons: string[] = [];
  const notes: string[] = [];
  const negative = (code: string) => answers[code]?.level === "inaccessible";

  // --- Step 1: can you get in? (reach the door, and the entrance doors are wide) ---
  const access = answers.access_until_entering;
  const ramp = answers.ramp;
  // For imported data without answers, read the ramp from its level.
  const rampAnswer =
    ramp?.main ?? (ramp ? { accessible: "yes", inaccessible: "no", not_applicable: "not_needed", partial: "yes" }[ramp.level] : undefined);

  if (access && ramp) {
    const barriers = access.details ?? [];
    if (access.level !== "inaccessible") {
      // Way to the door is fine. A ramp answer of Yes/No here contradicts "no steps".
      if (rampAnswer !== "not_needed") notes.push("contradictory_answers");
    } else if (barriers.includes("other")) {
      reasons.push("other_barrier");
      notes.push("other_barrier_read_notes");
    } else if (rampAnswer === "yes") {
      notes.push("ramp_makes_entrance_passable"); // stairs/curb, but the ramp bypasses them
    } else if (rampAnswer === "no") {
      reasons.push("steps_without_ramp");
    } else {
      // Barriers on the way but "ramp not needed": contradictory, and you can't get in.
      reasons.push("way_to_entrance_inaccessible");
      notes.push("contradictory_answers");
    }
  }
  if (negative("entrance_doors")) reasons.push("narrow_entrance_doors");
  if (ramp?.details?.includes("metal_wheel_tracks")) notes.push("ramp_metal_wheel_tracks");

  const cannotGetIn = reasons.length > 0;

  // --- Step 2: can you use it inside? Any negative inside answer -> partially accessible ---
  const inside: [string, string][] = [
    ["interior_space", "interior_inaccessible"],
    ["adapted_toilet", "no_adapted_toilet"],
    ["elevator", "no_elevator"],
    ["interior_doors", "narrow_interior_doors"],
    ["checkout_counter", "no_accessible_checkout"],
  ];
  const insideProblems = inside.filter(([code]) => negative(code)).map(([, reason]) => reason);

  let level: Level;
  if (cannotGetIn) level = "inaccessible";
  else if (insideProblems.length > 0) {
    level = "partial";
    reasons.push(...insideProblems);
  } else level = "accessible";

  // --- Parking never changes the level; it's only a note ---
  if (negative("designated_parking")) notes.push("no_designated_parking");
  if (!isPublishable(answers, level, mandatory)) notes.push("not_enough_to_publish");

  return { level, reasons, notes };
}

/** English labels for the codes above (Romanian comes with the dashboard translation). */
export const SUGGESTION_LABELS: Record<string, string> = {
  // reasons
  other_barrier: "another barrier on the way to the entrance",
  steps_without_ramp: "stairs or a curb and no ramp",
  way_to_entrance_inaccessible: "the way to the entrance isn't accessible",
  narrow_entrance_doors: "narrow entrance doors",
  interior_inaccessible: "the interior isn't accessible",
  no_adapted_toilet: "no adapted toilet",
  no_elevator: "no elevator",
  narrow_interior_doors: "narrow interior doors",
  no_accessible_checkout: "no accessible checkout counter",
  // reviewer notes
  no_designated_parking: "No designated parking",
  ramp_makes_entrance_passable: "Ramp makes the entrance passable — check the photo",
  contradictory_answers: "Answers contradict each other",
  other_barrier_read_notes: "“Other” barrier — read the notes",
  ramp_metal_wheel_tracks: "Ramp with metal wheel tracks",
  not_enough_to_publish: "Not enough to publish: the place stays “Not yet rated” after approval",
};

export const LEVEL_LABELS: Record<Level, string> = {
  accessible: "Accessible",
  partial: "Partially accessible",
  inaccessible: "Inaccessible",
};
