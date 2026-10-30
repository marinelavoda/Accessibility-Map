"use client";

// The review form: the submitted answers (editable, to correct them), what is published now,
// the suggested level (recalculated as you correct), and the Approve / Reject buttons.
// The server checks and recalculates everything again on Approve; nothing here is trusted.

import { useActionState, useEffect, useMemo, useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  LEVEL_LABELS,
  LEVELS,
  levelFromMainAnswer,
  SUGGESTION_LABELS,
  suggestLevel,
  type AnswerMap,
  type Level,
  type Suggestion,
} from "@/lib/scoring";
import { approve, openSubmission, reject, type DecisionState } from "./actions";

type Option = { code: string; label: string };

/** One criterion of the submission, as the page passes it in. */
export type ReviewCriterion = {
  code: string;
  name: string;
  mandatory: boolean;
  mainOptions: Option[];
  details: { code: string; prompt: string; options: Option[] } | null;
  hasNotes: boolean;
  submitted: { main: string; details: string[]; notes: string };
  /** What the place's current (published) assessment says, for comparison. */
  current: { main: string | null; details: string[]; notes: string; level: string } | null;
  photoCount: number;
};

type Answers = { main: string; details: string[]; notes: string };

export function ReviewForm({
  submissionId,
  criteria,
  unchanged,
  mandatory,
  storedSuggestion,
  canDecide,
}: {
  submissionId: string;
  criteria: ReviewCriterion[];
  /** The current assessment's criteria that this submission doesn't touch (kept on approval). */
  unchanged: AnswerMap;
  mandatory: string[];
  storedSuggestion: Suggestion | null;
  canDecide: boolean;
}) {
  const [answers, setAnswers] = useState<Record<string, Answers>>(() =>
    Object.fromEntries(criteria.map((c) => [c.code, c.submitted])),
  );
  const [chosenLevel, setChosenLevel] = useState<Level | null>(null);
  const [approveState, approveAction, approving] = useActionState<DecisionState, FormData>(approve, null);
  const [rejectState, rejectAction, rejecting] = useActionState<DecisionState, FormData>(reject, null);

  // Tell other reviewers this submission is open ("opened by … minutes ago").
  useEffect(() => {
    if (canDecide) openSubmission(submissionId);
  }, [canDecide, submissionId]);

  // The suggestion for the assessment as it would be after approval: corrected answers + unchanged criteria.
  const live = useMemo(() => {
    const merged: AnswerMap = { ...unchanged };
    for (const [code, a] of Object.entries(answers)) {
      merged[code] = { level: levelFromMainAnswer(a.main), main: a.main, details: a.details };
    }
    return suggestLevel(merged, mandatory);
  }, [answers, unchanged, mandatory]);

  const level = chosenLevel ?? live.level; // follows the suggestion until the reviewer picks a level
  const corrected = (c: ReviewCriterion) => JSON.stringify(answers[c.code]) !== JSON.stringify(c.submitted);
  const anyCorrected = criteria.some(corrected);
  const update = (code: string, change: Partial<Answers>) =>
    setAnswers((all) => ({ ...all, [code]: { ...all[code], ...change } }));

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
      {/* --- Left: the criteria --- */}
      <div className="space-y-4">
        {criteria.map((c) => (
          <Card key={c.code}>
            <CardHeader>
              <CardTitle className="flex flex-wrap items-center gap-2">
                {c.name}
                {c.mandatory && <Badge variant="outline">Mandatory</Badge>}
                {corrected(c) && <Badge variant="secondary">Corrected</Badge>}
              </CardTitle>
            </CardHeader>
            <CardContent className={canDecide ? "grid gap-4 md:grid-cols-2" : ""}>
              <fieldset disabled={!canDecide} className="space-y-3">
                <legend className="mb-2 text-sm font-medium">{canDecide ? "Submitted (you can correct it)" : "Saved answers"}</legend>
                <div role="radiogroup" aria-label={`${c.name}: main answer`} className="space-y-1">
                  {c.mainOptions.map((o) => (
                    <label key={o.code} className="flex items-center gap-2 text-sm">
                      <input
                        type="radio"
                        name={`${c.code}-main`}
                        value={o.code}
                        checked={answers[c.code].main === o.code}
                        onChange={() => update(c.code, { main: o.code })}
                      />
                      {o.label}
                      {o.code === c.submitted.main && corrected(c) && <span className="text-xs text-muted-foreground">(submitted)</span>}
                    </label>
                  ))}
                </div>
                {c.details && (
                  <div className="space-y-1">
                    <div className="text-sm text-muted-foreground">{c.details.prompt}</div>
                    {c.details.options.map((o) => (
                      <label key={o.code} className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={answers[c.code].details.includes(o.code)}
                          onChange={(e) =>
                            update(c.code, {
                              details: e.target.checked
                                ? [...answers[c.code].details, o.code]
                                : answers[c.code].details.filter((d) => d !== o.code),
                            })
                          }
                        />
                        {o.label}
                      </label>
                    ))}
                  </div>
                )}
                {c.hasNotes && (
                  <label className="grid gap-1 text-sm">
                    <span className="text-muted-foreground">Notes</span>
                    <textarea
                      value={answers[c.code].notes}
                      onChange={(e) => update(c.code, { notes: e.target.value })}
                      rows={2}
                      maxLength={2000}
                      className="rounded-lg border border-input bg-transparent px-2 py-1"
                    />
                  </label>
                )}
                <p className="text-sm text-muted-foreground">
                  {c.photoCount === 0
                    ? "No photos."
                    : `${c.photoCount} photo${c.photoCount === 1 ? "" : "s"} — viewing photos comes with photo storage (R2).`}
                </p>
              </fieldset>

              {/* Only while deciding: once approved, this assessment IS what's published. */}
              {canDecide && (
              <div className="space-y-1 rounded-lg bg-muted/50 p-3 text-sm">
                <div className="font-medium">Published now</div>
                {c.current ? (
                  <>
                    <div>{c.current.main ? optionLabel(c.mainOptions, c.current.main) : `Level only: ${c.current.level}`}</div>
                    {c.current.details.length > 0 && c.details && (
                      <div className="text-muted-foreground">{c.current.details.map((d) => optionLabel(c.details!.options, d)).join(", ")}</div>
                    )}
                    {c.current.notes && <div className="text-muted-foreground italic">“{c.current.notes}”</div>}
                  </>
                ) : (
                  <div className="text-muted-foreground">Not assessed yet.</div>
                )}
              </div>
              )}
            </CardContent>
          </Card>
        ))}

        {Object.keys(unchanged).length > 0 && (
          <p className="text-sm text-muted-foreground">
            Kept from the current assessment on approval (not part of this submission): {Object.keys(unchanged).length} other
            criteria.
          </p>
        )}
      </div>

      {/* --- Right: suggestion and decision --- */}
      <div className="space-y-4 lg:sticky lg:top-4 lg:self-start">
        <Card>
          <CardHeader>
            <CardDescription>Suggested level (rules)</CardDescription>
            <CardTitle className="text-xl" aria-live="polite">
              {LEVEL_LABELS[live.level]}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {live.reasons.length > 0 && <p>Because: {live.reasons.map((r) => SUGGESTION_LABELS[r] ?? r).join("; ")}.</p>}
            {live.notes.length > 0 && (
              <ul className="list-disc space-y-1 pl-5">
                {live.notes.map((n) => (
                  <li key={n}>{SUGGESTION_LABELS[n] ?? n}</li>
                ))}
              </ul>
            )}
            {storedSuggestion && anyCorrected && storedSuggestion.level !== live.level && (
              <p className="text-muted-foreground">
                Before your corrections: {LEVEL_LABELS[storedSuggestion.level]}.
              </p>
            )}
          </CardContent>
        </Card>

        {canDecide && (
          <>
            <Card>
              <CardHeader>
                <CardTitle>Approve</CardTitle>
                <CardDescription>You have the final say on the level.</CardDescription>
              </CardHeader>
              <CardContent>
                <form action={approveAction} className="space-y-3">
                  <input type="hidden" name="submissionId" value={submissionId} />
                  <input type="hidden" name="corrections" value={JSON.stringify(answers)} />
                  <label className="grid gap-1 text-sm">
                    Level
                    <select
                      name="level"
                      value={level}
                      onChange={(e) => setChosenLevel(e.target.value as Level)}
                      className="h-9 rounded-lg border border-input bg-transparent px-2"
                    >
                      {LEVELS.map((l) => (
                        <option key={l} value={l}>
                          {LEVEL_LABELS[l]}
                          {l === live.level ? " (suggested)" : ""}
                        </option>
                      ))}
                    </select>
                  </label>
                  {anyCorrected && <p className="text-sm text-muted-foreground">Your corrections are saved with the approval.</p>}
                  {approveState?.error && (
                    <Alert variant="destructive" role="alert">
                      <AlertDescription>{approveState.error}</AlertDescription>
                    </Alert>
                  )}
                  <Button type="submit" className="w-full" disabled={approving || rejecting}>
                    {approving ? "Approving…" : "Approve"}
                  </Button>
                </form>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Reject</CardTitle>
                <CardDescription>Nothing is published. The reason is saved for the contributor.</CardDescription>
              </CardHeader>
              <CardContent>
                <form action={rejectAction} className="space-y-3">
                  <input type="hidden" name="submissionId" value={submissionId} />
                  <label className="grid gap-1 text-sm">
                    Reason (required)
                    <textarea
                      name="reason"
                      required
                      rows={3}
                      maxLength={1000}
                      className="rounded-lg border border-input bg-transparent px-2 py-1"
                    />
                  </label>
                  {rejectState?.error && (
                    <Alert variant="destructive" role="alert">
                      <AlertTitle>Not rejected</AlertTitle>
                      <AlertDescription>{rejectState.error}</AlertDescription>
                    </Alert>
                  )}
                  <Button type="submit" variant="outline" className="w-full" disabled={approving || rejecting}>
                    {rejecting ? "Rejecting…" : "Reject"}
                  </Button>
                </form>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </div>
  );
}

function optionLabel(options: Option[], code: string) {
  return options.find((o) => o.code === code)?.label ?? code;
}
