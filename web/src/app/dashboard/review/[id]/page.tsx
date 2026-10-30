import Link from "next/link";
import { notFound } from "next/navigation";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { formatDate, formatTimeAgo, isWithinMinutes } from "@/lib/format";
import { LEVEL_LABELS, type AnswerMap, type Suggestion } from "@/lib/scoring";
import { requireRole } from "@/server/require-role";
import { loadSubmission } from "@/server/review";
import { ReviewForm, type ReviewCriterion } from "./review-form";

const DONE_MESSAGE = {
  published: "Approved and published on the map.",
  approved: "Approved. The answers are saved, but the place stays “Not yet rated” until the publishing rule is met.",
  rejected: "Rejected. Nothing was published.",
};

/** The "opened by …" warning is shown for this long after another reviewer opened the submission. */
const OPENED_WARNING_MINUTES = 60;

// One submission (PRD R23, R24): answers next to what's published now, the suggested level,
// and Approve / Reject. Read-only once the submission has been decided.
export default async function SubmissionPage({ params, searchParams }: PageProps<"/dashboard/review/[id]">) {
  const reviewer = await requireRole("reviewer");
  const { id } = await params;
  const { done } = await searchParams;
  const data = await loadSubmission(id);
  if (!data) notFound();

  const { submission, place, questionnaire, submitted, current } = data;
  const pending = submission.status === "pending";

  // --- Shape the data for the form ---
  const label = (t: { en: string }) => t.en;
  const currentByCode = new Map(current?.results.map((r) => [r.criterionCode, r]));
  const criteria: ReviewCriterion[] = submitted.map((result) => {
    const c = questionnaire.find((q) => q.code === result.criterionCode)!;
    const main = c.questions.find((q) => q.code === "main")!;
    const details = c.questions.find((q) => q.type === "checkboxes") ?? null;
    const notes = c.questions.find((q) => q.type === "text") ?? null;
    const valueOf = (r: typeof result | undefined, questionId: string | undefined) =>
      r?.answers.find((a) => a.questionId === questionId)?.value;
    const cur = currentByCode.get(result.criterionCode);
    return {
      code: c.code,
      name: label(c.name),
      mandatory: c.isMandatory,
      mainOptions: (main.options ?? []).map((o) => ({ code: o.code, label: label(o.label) })),
      details: details
        ? { code: details.code, prompt: label(details.prompt), options: (details.options ?? []).map((o) => ({ code: o.code, label: label(o.label) })) }
        : null,
      hasNotes: Boolean(notes),
      submitted: {
        main: String(valueOf(result, main.id) ?? ""),
        details: (valueOf(result, details?.id) as string[] | undefined) ?? [],
        notes: String(valueOf(result, notes?.id) ?? ""),
      },
      current: cur
        ? {
            main: (valueOf(cur, main.id) as string | undefined) ?? null,
            details: (valueOf(cur, details?.id) as string[] | undefined) ?? [],
            notes: String(valueOf(cur, notes?.id) ?? ""),
            level: cur.level,
          }
        : null,
      photoCount: result.photos.length,
    };
  });

  // The current assessment's other criteria: kept on approval, and part of the live suggestion.
  const submittedCodes = new Set(submitted.map((r) => r.criterionCode));
  const unchanged: AnswerMap = {};
  for (const r of current?.results ?? []) {
    if (submittedCodes.has(r.criterionCode)) continue;
    const c = questionnaire.find((q) => q.code === r.criterionCode)!;
    const value = (code: string) => r.answers.find((a) => a.questionId === c.questions.find((q) => q.code === code)?.id)?.value;
    const detailsQuestion = c.questions.find((q) => q.type === "checkboxes");
    const main = value("main");
    unchanged[r.criterionCode] = {
      level: r.level,
      main: typeof main === "string" ? main : undefined,
      details: detailsQuestion ? (value(detailsQuestion.code) as string[] | undefined) : undefined,
    };
  }

  const stored = data.suggestion
    ? ({ level: data.suggestion.level, ...(data.suggestion.explanation as Omit<Suggestion, "level">) } satisfies Suggestion)
    : null;

  const openedByOther =
    pending &&
    submission.reviewingBy &&
    submission.reviewingBy !== reviewer.id &&
    submission.reviewingSince &&
    isWithinMinutes(submission.reviewingSince, OPENED_WARNING_MINUTES);

  return (
    <div className="space-y-6">
      <nav aria-label="Breadcrumb" className="text-sm">
        <Link href="/dashboard/review" className="underline">
          Review queue
        </Link>
      </nav>

      {typeof done === "string" && done in DONE_MESSAGE && (
        <Alert role="status">
          <AlertTitle>Previous submission: done</AlertTitle>
          <AlertDescription>{DONE_MESSAGE[done as keyof typeof DONE_MESSAGE]} This is the next one in the queue.</AlertDescription>
        </Alert>
      )}

      <div className="space-y-1">
        <h1 className="text-2xl font-semibold">{place.name}</h1>
        <p className="text-muted-foreground">
          {label(data.category)}
          {place.address ? ` · ${place.address}` : ""}
          {place.status !== "active" && ` · ${place.status}`}
        </p>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <Badge variant={submission.kind === "update" ? "secondary" : "default"}>
            {submission.kind === "update" ? "Update" : "First assessment"}
          </Badge>
          <span>
            by {data.submittedBy} on {formatDate(submission.submittedAt)}
          </span>
          <span className="text-muted-foreground">
            · On the map now: {place.publishedLevel ? LEVEL_LABELS[place.publishedLevel] : "Not yet rated"}
          </span>
          <Link href={`/dashboard/history?place=${place.id}`} className="underline">
            History
          </Link>
        </div>
      </div>

      {openedByOther && (
        <Alert>
          <AlertTitle>Another reviewer has this open</AlertTitle>
          <AlertDescription>
            Opened by {data.openedByName} {formatTimeAgo(submission.reviewingSince!)}. Check with them before you decide.
          </AlertDescription>
        </Alert>
      )}

      {!pending && (
        <Alert variant={submission.status === "rejected" ? "destructive" : "default"}>
          <AlertTitle>
            {submission.status === "approved" ? "Approved" : "Rejected"} by {data.decidedByName} on {formatDate(submission.reviewedAt)}
            {submission.editedByReviewer ? " (with corrections)" : ""}
          </AlertTitle>
          {submission.rejectionReason && <AlertDescription>Reason: {submission.rejectionReason}</AlertDescription>}
        </Alert>
      )}

      <ReviewForm
        submissionId={submission.id}
        criteria={criteria}
        unchanged={unchanged}
        mandatory={questionnaire.filter((c) => c.isMandatory).map((c) => c.code)}
        storedSuggestion={stored}
        canDecide={pending}
      />
    </div>
  );
}
