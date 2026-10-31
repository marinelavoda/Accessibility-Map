"use client";

// "Edit accessibility" (admins): what's published, criterion by criterion, as a summary.
// Staff open just the criteria they want to change (Edit answer), press Done, and
// publish all their changes at once from the panel on the right, which lists every change
// and the resulting level. The server checks and recalculates everything; nothing here is trusted.

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
  type ResultLevel,
} from "@/lib/scoring";
import { saveAssessment, type EditState } from "./actions";

export type EditCriterion = CriterionQuestions & {
  mandatory: boolean;
  /** The published answers, or null if this criterion has no answers. */
  published: CriterionValue | null;
  /** The published level; imported data can have a level without answers. */
  publishedLevel: ResultLevel | null;
};

const EMPTY: CriterionValue = { main: "", details: [], notes: "" };
const RESULT_LABEL: Record<ResultLevel, string> = {
  accessible: "Accessible",
  partial: "Partially accessible",
  inaccessible: "Not accessible",
  not_applicable: "Not applicable",
};

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
  // The answers as they will be published (only changed by "Done").
  const [answers, setAnswers] = useState<Record<string, CriterionValue>>(() =>
    Object.fromEntries(criteria.map((c) => [c.code, c.published ?? EMPTY])),
  );
  // Criteria open for editing, with their unfinished answers.
  const [drafts, setDrafts] = useState<Record<string, CriterionValue>>({});
  const [chosenLevel, setChosenLevel] = useState<Level | null>(null);
  const [state, action, saving] = useActionState<EditState, FormData>(saveAssessment, null);

  const isChanged = (c: EditCriterion) => JSON.stringify(answers[c.code]) !== JSON.stringify(c.published ?? EMPTY);
  const changes = criteria.filter(isChanged);
  const openDrafts = Object.keys(drafts).length;

  // The assessment as it will be after publishing, for the suggestion and the publishing rule.
  const merged = useMemo(() => {
    const map: AnswerMap = {};
    for (const c of criteria) {
      const a = answers[c.code];
      if (a.main) map[c.code] = { level: levelFromMainAnswer(a.main), main: a.main, details: a.details };
      else if (c.publishedLevel) map[c.code] = { level: c.publishedLevel };
    }
    return map;
  }, [answers, criteria]);
  const live = useMemo(() => suggestLevel(merged, mandatory), [merged, mandatory]);
  // Until staff pick a level: the published one while no answer changed, then the suggestion.
  const level = chosenLevel ?? (changes.length === 0 && publishedOverall ? publishedOverall : live.level);
  const levelChanged = level !== publishedOverall;
  const publishable = isPublishable(merged, level, mandatory);

  function startEditing(c: EditCriterion) {
    setDrafts((d) => ({ ...d, [c.code]: answers[c.code] }));
  }
  function finishEditing(code: string) {
    setAnswers((a) => ({ ...a, [code]: drafts[code] }));
    closeDraft(code);
  }
  function closeDraft(code: string) {
    setDrafts((d) => Object.fromEntries(Object.entries(d).filter(([k]) => k !== code)));
  }
  function undo(c: EditCriterion) {
    setAnswers((a) => ({ ...a, [c.code]: c.published ?? EMPTY }));
  }

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    // Only answered criteria are sent; the server works out which ones really changed.
    data.set("answers", JSON.stringify(Object.fromEntries(Object.entries(answers).filter(([, a]) => a.main))));
    startTransition(() => action(data));
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
      {/* --- Left: what's published, criterion by criterion --- */}
      <ul className="divide-y rounded-lg border" aria-label="Criteria">
        {criteria.map((c) => {
          const draft = drafts[c.code];
          const value = answers[c.code];
          const rowLevel: ResultLevel | null = value.main ? levelFromMainAnswer(value.main) : c.publishedLevel;
          return (
            <li key={c.code} className={`space-y-3 p-4 ${rowLevel || draft ? "" : "bg-muted/40"}`}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-medium">{c.name}</h3>
                    {c.mandatory && <Badge variant="outline">Mandatory</Badge>}
                    {isChanged(c) && <Badge variant="secondary">Changed</Badge>}
                  </div>
                  {!draft && (
                    <div className="space-y-0.5 text-sm">
                      <div>
                        <LevelText level={rowLevel} />
                        {value.main && <span className="text-muted-foreground"> · {describe(c, value)}</span>}
                        {!value.main && c.publishedLevel && (
                          <span className="text-muted-foreground"> · imported with a level only, no answers</span>
                        )}
                      </div>
                      {value.notes && <div className="text-muted-foreground italic">“{value.notes}”</div>}
                      {isChanged(c) && (
                        <div className="text-muted-foreground">
                          Published now:{" "}
                          {c.published ? describe(c, c.published) : c.publishedLevel ? RESULT_LABEL[c.publishedLevel] : "not assessed"}
                        </div>
                      )}
                    </div>
                  )}
                </div>
                {!draft && (
                  <div className="flex gap-2">
                    {isChanged(c) && (
                      <Button type="button" variant="ghost" size="sm" onClick={() => undo(c)} aria-label={`Undo changes to ${c.name}`}>
                        Undo
                      </Button>
                    )}
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => startEditing(c)}
                      aria-label={`Edit answer for ${c.name}`}
                    >
                      Edit answer
                    </Button>
                  </div>
                )}
              </div>

              {draft && (
                <div className="space-y-3 rounded-lg border bg-background p-3">
                  <CriterionFields
                    criterion={c}
                    value={draft}
                    onChange={(change) => setDrafts((d) => ({ ...d, [c.code]: { ...d[c.code], ...change } }))}
                    mark={c.published ? { code: c.published.main, label: "(published)" } : undefined}
                  />
                  <div className="flex gap-2">
                    <Button type="button" size="sm" onClick={() => finishEditing(c.code)} disabled={!draft.main}>
                      Done
                    </Button>
                    <Button type="button" variant="outline" size="sm" onClick={() => closeDraft(c.code)}>
                      Cancel
                    </Button>
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {/* --- Right: the changes and the level, published together --- */}
      <div className="space-y-4 lg:sticky lg:top-4 lg:self-start">
        <Card>
          <CardHeader>
            <CardTitle>
              {changes.length === 0 ? "No answer changes yet" : `${changes.length} change${changes.length === 1 ? "" : "s"}`}
            </CardTitle>
            <CardDescription>
              {expectedCurrentId
                ? "Publishing saves a new assessment; the current one is kept in the history."
                : "This place has no assessment yet; this will be its first."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={submit} className="space-y-4">
              <input type="hidden" name="placeId" value={placeId} />
              <input type="hidden" name="expectedCurrentId" value={expectedCurrentId ?? ""} />

              {(changes.length > 0 || levelChanged) && (
                <ul className="space-y-1 text-sm" aria-label="Changes">
                  {changes.map((c) => {
                    const before = c.published ? describe(c, c.published) : "not assessed";
                    const after = describe(c, answers[c.code]);
                    return (
                      <li key={c.code}>
                        <span className="font-medium">{c.name}:</span>{" "}
                        {before === after ? (
                          answers[c.code].notes ? "notes changed" : "notes removed"
                        ) : (
                          <>
                            <span className="text-muted-foreground">{before} →</span> {after}
                          </>
                        )}
                      </li>
                    );
                  })}
                  {levelChanged && (
                    <li>
                      <span className="font-medium">Level on the map:</span>{" "}
                      <span className="text-muted-foreground">{publishedOverall ? LEVEL_LABELS[publishedOverall] : "not rated"} →</span>{" "}
                      {publishable ? LEVEL_LABELS[level] : "not rated yet (see below)"}
                    </li>
                  )}
                </ul>
              )}

              <div className="space-y-1 rounded-lg bg-muted/50 p-3 text-sm" aria-live="polite">
                <div>
                  Suggested level: <strong>{LEVEL_LABELS[live.level]}</strong>
                </div>
                {live.reasons.length > 0 && (
                  <div className="text-muted-foreground">Because: {live.reasons.map((r) => SUGGESTION_LABELS[r] ?? r).join("; ")}.</div>
                )}
                {live.notes.map((n) => (
                  <div key={n} className="text-muted-foreground">
                    · {SUGGESTION_LABELS[n] ?? n}
                  </div>
                ))}
              </div>

              <label className="grid gap-1 text-sm">
                Level to publish
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
                // A place that is on the map now would disappear from it: make that impossible to miss.
                <Alert variant={publishedOverall ? "destructive" : "default"}>
                  <AlertDescription>
                    {publishedOverall ? "This would take the place off the map (“Not yet rated”). " : ""}
                    {level === "inaccessible"
                      ? "To show “Inaccessible”, the entry path (access, ramp, entrance doors) must be answered."
                      : `To show “${LEVEL_LABELS[level]}”, all 6 mandatory criteria must be answered.`}{" "}
                    The answers are still saved.
                  </AlertDescription>
                </Alert>
              )}

              <label className="flex items-start gap-2 text-sm">
                <input type="checkbox" name="newVisit" value="yes" className="mt-1" />
                <span>
                  Someone checked the place in person.{" "}
                  <span className="text-muted-foreground">Sets “last verified” to today. Leave it unticked for a desk correction.</span>
                </span>
              </label>
              <label className="grid gap-1 text-sm">
                Why the change? (optional, kept in the change history)
                <textarea name="note" rows={2} maxLength={1000} className="rounded-lg border border-input bg-transparent px-2 py-1" />
              </label>

              {openDrafts > 0 && (
                <p className="text-sm text-muted-foreground">Press Done (or Cancel) on the criteria you&apos;re editing first.</p>
              )}
              {state?.error && (
                <Alert variant="destructive" role="alert">
                  <AlertDescription>{state.error}</AlertDescription>
                </Alert>
              )}
              <Button type="submit" className="w-full" disabled={saving || openDrafts > 0}>
                {saving ? "Publishing…" : "Publish changes"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function LevelText({ level }: { level: ResultLevel | null }) {
  if (!level) return <span className="text-muted-foreground">Not assessed</span>;
  const symbol = { accessible: "✓", partial: "◐", inaccessible: "✗", not_applicable: "–" }[level];
  return (
    <span className="font-medium">
      <span aria-hidden="true">{symbol} </span>
      {RESULT_LABEL[level]}
    </span>
  );
}

/** "No (stairs, curb)": the main answer and the ticked details, in words. */
function describe(c: CriterionQuestions, value: CriterionValue): string {
  if (!value.main) return "not assessed";
  const main = c.mainOptions.find((o) => o.code === value.main)?.label ?? value.main;
  const details = value.details.map((d) => c.details?.options.find((o) => o.code === d)?.label ?? d);
  return details.length > 0 ? `${main} (${details.join(", ")})` : main;
}
