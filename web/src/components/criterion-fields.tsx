"use client";

// The answers to one criterion: the main answer (radio buttons), the checkbox details and
// the notes. Used by the review page (correcting a submission) and by the "Edit accessibility"
// page (admins correcting what's published), so both ask the questions the same way.

export type CriterionOption = { code: string; label: string };

export type CriterionQuestions = {
  code: string;
  name: string;
  mainOptions: CriterionOption[];
  details: { code: string; prompt: string; options: CriterionOption[] } | null;
  hasNotes: boolean;
};

/** main is "" while nothing is chosen. */
export type CriterionValue = { main: string; details: string[]; notes: string };

export function CriterionFields({
  criterion: c,
  value,
  onChange,
  mark,
}: {
  criterion: CriterionQuestions;
  value: CriterionValue;
  onChange: (change: Partial<CriterionValue>) => void;
  /** Shows a small label next to one main option, e.g. "(submitted)" or "(published)". */
  mark?: { code: string; label: string };
}) {
  return (
    <>
      <div role="radiogroup" aria-label={`${c.name}: main answer`} className="space-y-1">
        {c.mainOptions.map((o) => (
          <label key={o.code} className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              name={`${c.code}-main`}
              value={o.code}
              checked={value.main === o.code}
              onChange={() => onChange({ main: o.code })}
            />
            {o.label}
            {mark?.code === o.code && <span className="text-xs text-muted-foreground">{mark.label}</span>}
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
                checked={value.details.includes(o.code)}
                onChange={(e) =>
                  onChange({
                    details: e.target.checked ? [...value.details, o.code] : value.details.filter((d) => d !== o.code),
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
            value={value.notes}
            onChange={(e) => onChange({ notes: e.target.value })}
            rows={2}
            maxLength={2000}
            className="rounded-lg border border-input bg-transparent px-2 py-1"
          />
        </label>
      )}
    </>
  );
}
