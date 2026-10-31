import Link from "next/link";
import { notFound } from "next/navigation";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { formatDate } from "@/lib/format";
import { LEVEL_LABELS } from "@/lib/scoring";
import { requireRole } from "@/server/require-role";
import { loadForAdminEdit } from "@/server/review";
import { AssessmentEditForm, type EditCriterion } from "./edit-form";

// Edit accessibility (admins): correct what's published for a place without a submission,
// e.g. a mistake spotted later, or MOTIVAȚIE's own visit. Saving goes through the same
// approval steps as a reviewed submission (hard rule 3).
export default async function EditAssessmentPage({ params }: PageProps<"/dashboard/places/[id]/assessment">) {
  await requireRole("admin");
  const { id } = await params;
  const data = await loadForAdminEdit(id);
  if (!data) notFound();
  const { place, current, questionnaire } = data;

  const label = (t: { en: string }) => t.en;
  const criteria: EditCriterion[] = questionnaire
    .filter((c) => c.isActive)
    .map((c) => {
      const main = c.questions.find((q) => q.code === "main")!;
      const details = c.questions.find((q) => q.type === "checkboxes") ?? null;
      const notes = c.questions.find((q) => q.type === "text") ?? null;
      const result = current?.results.find((r) => r.criterionCode === c.code);
      const valueOf = (questionId: string | undefined) => result?.answers.find((a) => a.questionId === questionId)?.value;
      const publishedMain = valueOf(main.id);
      return {
        code: c.code,
        name: label(c.name),
        mandatory: c.isMandatory,
        mainOptions: (main.options ?? []).map((o) => ({ code: o.code, label: label(o.label) })),
        details: details
          ? { code: details.code, prompt: label(details.prompt), options: (details.options ?? []).map((o) => ({ code: o.code, label: label(o.label) })) }
          : null,
        hasNotes: Boolean(notes),
        published:
          typeof publishedMain === "string"
            ? {
                main: publishedMain,
                details: (valueOf(details?.id) as string[] | undefined) ?? [],
                notes: String(valueOf(notes?.id) ?? ""),
              }
            : null,
        publishedLevel: result?.level ?? null,
      };
    });

  return (
    <div className="space-y-6">
      <nav aria-label="Breadcrumb" className="text-sm">
        <Link href="/dashboard/places" className="underline">
          Places
        </Link>
        {" / "}
        <Link href={`/dashboard/places/${place.id}`} className="underline">
          {place.name}
        </Link>
      </nav>
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold">Edit accessibility</h1>
        <p className="text-muted-foreground">
          {place.name}
          {place.address ? ` · ${place.address}` : ""} · On the map now:{" "}
          {place.publishedLevel ? LEVEL_LABELS[place.publishedLevel] : "Not yet rated"} · Last verified{" "}
          {formatDate(place.lastVerifiedAt)}
        </p>
      </div>
      <Alert>
        <AlertDescription>
          For corrections by MOTIVAȚIE staff. Changes are published as soon as you save, without review, and are recorded in
          the change history with your name. To check someone else&apos;s information, use the review queue instead.
        </AlertDescription>
      </Alert>
      <AssessmentEditForm
        placeId={place.id}
        expectedCurrentId={current?.id ?? null}
        criteria={criteria}
        publishedOverall={current?.overallLevel ?? null}
        mandatory={questionnaire.filter((c) => c.isMandatory).map((c) => c.code)}
      />
    </div>
  );
}
