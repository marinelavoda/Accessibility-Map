"use client";

// The "Edit accessibility" form (admins): every criterion, prefilled with what's published.
// Changing answers and pressing Save publishes a new assessment, through the same steps as
// approving a submission. The server checks and recalculates everything; nothing here is trusted.

import { startTransition, useActionState, useMemo, useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CriterionFields, type CriterionQuestions, type CriterionValue } from "@/components/criterion-fields";
import {
  isPublishable,
  LEVEL_LABELS,
  LEVELS,
  levelFromMainAnswer,
  SUGGESTION_LABELS,
  suggestLevel,
  type AnswerMap,
  type Level,
} from "@/lib/scoring";
import { saveAssessment, type EditState } from "./actions";

export type EditCriterion = CriterionQuestions & {
  mandatory: boolean;
  /** The published answers, or null if this criterion isn't assessed yet. */
  published: CriterionValue | null;
  /** Imported data can have a level without answers. */
  publishedLevel: string | null;
};

const EMPTY: CriterionValue = { main: "", details: [], notes: "" };

export function AssessmentEditForm({
  placeId,
  expectedCurrentId,
  criteria,
  publishedOverall,
  mandatory,
}: {
  placeId: string;
  expectedCurrentId: string | null;
  criteria: EditCriterion[];
  publishedOverall: Level | null;
  mandatory: string[];
}) {
  const [answers, setAnswers] = useState<Record<string, CriterionValue>>(() =>
    Object.fromEntries(criteria.map((c) => [c.code, c.published ?? EMPTY])),
  );
  const [chosenLevel, setChosenLevel] = useState<Level | null>(null);
  const [state, action, saving] = useActionState<EditState, FormData>(saveAssessment, null);

  const changed = (c: EditCriterion) => JSON.stringify(answers[c.code]) !== JSON.stringify(c.published ?? EMPTY);
  const update = (code: string, change: Partial<CriterionValue>) =>
    setAnswers((all) => ({ ...all, [code]: { ...all[code], ...change } }));

  // The assessment as it would be after saving, for the suggestion and the publishing rule.
  const merged = useMemo(() => {
    const map: AnswerMap = {};
    for (const c of criteria) {
      const a = answers[c.code];
      if (a.main) map[c.code] = { level: levelFromMainAnswer(a.main), main: a.main, details: a.details };
      else if (c.publishedLevel) map[c.code] = { level: c.publishedLevel as AnswerMap[string]["level"] };
    }
    return map;
  }, [answers, criteria]);
  const live = useMemo(() => suggestLevel(merged, mandatory), [merged, mandatory]);
  const changedCount = criteria.filter(changed).length;
  // Until the admin picks a level: the published one while nothing changed, then the suggestion.
  const level = chosenLevel ?? (changedCount === 0 && publishedOverall ? publishedOverall : live.level);
  const publishable = isPublishable(merged, level, mandatory);

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    // Only answered criteria are sent; the server works out which ones really changed.
    const sent = Object.fromEntries(Object.entries(answers).filter(([, a]) => a.main));
    data.set("answers", JSON.stringify(sent));
    startTransition(() => action(data));
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="space-y-4">
        {criteria.map((c) => (
          <Card key={c.code}>
            <CardHeader>
              <CardTitle className="flex flex-wrap items-center gap-2">
                {c.name}
                {c.mandatory && <Badge variant="outline">Mandatory</Badge>}
                {changed(c) && <Badge variant="secondary">Changed</Badge>}
                {!c.published && !c.publishedLevel && !answers[c.code].main && <Badge variant="outline">Not assessed</Badge>}
              </CardTitle>
              {!c.published && c.publishedLevel && (
                <CardDescription>
                  Imported with a level only ({c.publishedLevel.replace("_", " ")}), no answers. Choose an answer to replace it.
                </CardDescription>
              )}
            </CardHeader>
            <CardContent className="space-y-3">
              <CriterionFields
                criterion={c}
                value={answers[c.code]}
                onChange={(change) => update(c.code, change)}
                mark={c.published && changed(c) ? { code: c.published.main, label: "(published)" } : undefined}
              />
              {changed(c) && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setAnswers((all) => ({ ...all, [c.code]: c.published ?? EMPTY }))}
                >
                  {c.published ? "Undo changes" : "Clear"}
                </Button>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="space-y-4 lg:sticky lg:top-4 lg:self-start">
        <Card>
          <CardHeader>
            <CardDescription>Suggested level (rules)</CardDescription>
            <CardTitle className="text-xl" aria-live="polite">
              {LEVEL_LABELS[live.level]}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {live.reasons.length > 0 && <p>Because: {live.reasons.map((r) => SUGGESTION_LABELS[r] ?? r).join("; ")}.</p>}
            {live.notes.length > 0 && (
              <ul className="list-disc space-y-1 pl-5">
                {live.notes.map((n) => (
                  <li key={n}>{SUGGESTION_LABELS[n] ?? n}</li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Save and publish</CardTitle>
            <CardDescription>
              {expectedCurrentId
                ? "Saves a new assessment; the current one is kept in the history."
                : "This place has no assessment yet; this will be its first."}{" "}
              {changedCount} {changedCount === 1 ? "criterion" : "criteria"} changed.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={submit} className="space-y-3">
              <input type="hidden" name="placeId" value={placeId} />
              <input type="hidden" name="expectedCurrentId" value={expectedCurrentId ?? ""} />
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
                      {l === publishedOverall ? " (published now)" : ""}
                    </option>
                  ))}
                </select>
              </label>
              {!publishable && (
                <p className="text-sm text-muted-foreground">
                  {level === "inaccessible"
                    ? "Not enough to show on the map yet: the entry path (access, ramp, entrance doors) must be answered."
                    : "Not enough to show this level on the map yet: all 6 mandatory criteria must be answered. The answers are still saved."}
                </p>
              )}
              <label className="flex items-start gap-2 text-sm">
                <input type="checkbox" name="newVisit" value="yes" className="mt-1" />
                <span>
                  Someone checked the place in person. <span className="text-muted-foreground">Sets “last verified” to today.
                  Leave it unticked for a desk correction.</span>
                </span>
              </label>
              <label className="grid gap-1 text-sm">
                Why the change? (optional, kept in the change history)
                <textarea name="note" rows={2} maxLength={1000} className="rounded-lg border border-input bg-transparent px-2 py-1" />
              </label>
              {state?.error && (
                <Alert variant="destructive" role="alert">
                  <AlertDescription>{state.error}</AlertDescription>
                </Alert>
              )}
              <Button type="submit" className="w-full" disabled={saving}>
                {saving ? "Saving…" : "Save and publish"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
