import Link from "next/link";
import { notFound } from "next/navigation";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/format";
import { whyNotDeletable } from "@/lib/place-input";
import { LEVEL_LABELS } from "@/lib/scoring";
import { getPlaceDetails } from "@/server/places-admin";
import { requireRole } from "@/server/require-role";
import { hasRole } from "@/server/roles";
import { changePlaceStatus } from "../actions";
import { DeletePlaceForm } from "./delete-form";

const STATUS_LABEL = { active: "Shown in the app", hidden: "Hidden", gone_from_osm: "Gone from OpenStreetMap" };
const RESULT_LABEL = { ...LEVEL_LABELS, not_applicable: "Not applicable" };
const SUBMISSION_STATUS = { pending: "Waiting for review", approved: "Approved", rejected: "Rejected" };
const SAVED_MESSAGE: Record<string, string> = {
  "1": "Saved.",
  hidden: "Hidden. The place no longer appears in the app; everything about it is kept.",
  active: "The place appears in the app again.",
  assessment: "Saved. The new assessment is published on the map.",
  "assessment-unpublished":
    "Saved. The answers are kept, but the level isn't shown on the map until the publishing rule is met (see Edit accessibility).",
};

// One place: its details, what's published, and every submission about it.
// Reviewers can look; only admins see the buttons (and the actions check again).
export default async function PlacePage({ params, searchParams }: PageProps<"/dashboard/places/[id]">) {
  const user = await requireRole("reviewer");
  const { id } = await params;
  const { saved, error } = await searchParams;
  const details = await getPlaceDetails(id);
  if (!details) notFound();

  const { place, category, results } = details;
  const isAdmin = hasRole(user.role, "admin");
  const cantDelete = whyNotDeletable(place.source, details.assessmentCount);

  return (
    <div className="space-y-6">
      <nav aria-label="Breadcrumb" className="text-sm">
        <Link href="/dashboard/places" className="underline">
          Places
        </Link>
      </nav>

      {typeof saved === "string" && SAVED_MESSAGE[saved] && (
        <Alert role="status">
          <AlertDescription>{SAVED_MESSAGE[saved]}</AlertDescription>
        </Alert>
      )}
      {error === "changed" && (
        <Alert variant="destructive" role="alert">
          <AlertDescription>Someone changed this place at the same time. Check it and try again.</AlertDescription>
        </Alert>
      )}

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold">{place.name}</h1>
          <p className="text-muted-foreground">
            {category.en}
            {place.address ? ` · ${place.address}` : ""}
          </p>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <Badge variant={place.status === "active" ? "outline" : "destructive"}>{STATUS_LABEL[place.status]}</Badge>
            <span>On the map: {place.publishedLevel ? LEVEL_LABELS[place.publishedLevel] : "Not yet rated"}</span>
          </div>
        </div>
        {isAdmin && (
          <div className="flex flex-wrap gap-2">
            <Button nativeButton={false} render={<Link href={`/dashboard/places/${place.id}/edit`} />}>
              Edit details
            </Button>
            <Button nativeButton={false} variant="outline" render={<Link href={`/dashboard/places/${place.id}/assessment`} />}>
              Edit accessibility
            </Button>
            <form action={changePlaceStatus}>
              <input type="hidden" name="placeId" value={place.id} />
              <input type="hidden" name="status" value={place.status === "hidden" ? "active" : "hidden"} />
              <Button type="submit" variant="outline">
                {place.status === "hidden" ? "Show in the app again" : "Hide from the app"}
              </Button>
            </form>
          </div>
        )}
      </div>

      <section aria-labelledby="details-heading" className="space-y-2">
        <h2 id="details-heading" className="text-lg font-semibold">
          Details
        </h2>
        <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-[max-content_1fr]">
          <dt className="text-muted-foreground">Other names</dt>
          <dd>{place.otherNames?.length ? place.otherNames.join(", ") : "—"}</dd>
          <dt className="text-muted-foreground">Location</dt>
          <dd>
            <a
              href={`https://www.openstreetmap.org/?mlat=${place.lat}&mlon=${place.lng}#map=19/${place.lat}/${place.lng}`}
              target="_blank"
              rel="noreferrer"
              className="underline"
            >
              {place.lat}, {place.lng}
            </a>
          </dd>
          <dt className="text-muted-foreground">Source</dt>
          <dd>
            {/* Sample data uses negative OpenStreetMap IDs, which have no page to link to. */}
            {place.source === "osm" && place.osmId! > 0 ? (
              <a
                href={`https://www.openstreetmap.org/${place.osmType}/${place.osmId}`}
                target="_blank"
                rel="noreferrer"
                className="underline"
              >
                OpenStreetMap ({place.osmTag})
              </a>
            ) : place.source === "osm" ? (
              `OpenStreetMap (${place.osmTag})`
            ) : (
              "Added by an admin"
            )}
          </dd>
          <dt className="text-muted-foreground">Last verified</dt>
          <dd>{formatDate(place.lastVerifiedAt)}</dd>
        </dl>
        {isAdmin && (
          <Link href={`/dashboard/history?place=${place.id}`} className="text-sm underline">
            Change history for this place
          </Link>
        )}
      </section>

      <section aria-labelledby="published-heading" className="space-y-2">
        <h2 id="published-heading" className="text-lg font-semibold">
          Published assessment
        </h2>
        {results.length === 0 ? (
          <p className="text-sm text-muted-foreground">No approved assessment yet.</p>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">
              Verified {formatDate(results[0].verifiedAt)}. Levels change by approving a submission
              {isAdmin ? ", or with Edit accessibility" : ""}.
            </p>
            <ul className="divide-y rounded-lg border text-sm">
              {results.map((r) => (
                <li key={r.criterion.en} className="flex justify-between gap-4 px-4 py-2">
                  <span>{r.criterion.en}</span>
                  <span className="text-muted-foreground">{RESULT_LABEL[r.level]}</span>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      <section aria-labelledby="submissions-heading" className="space-y-2">
        <h2 id="submissions-heading" className="text-lg font-semibold">
          Submissions
        </h2>
        {details.submissions.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nobody has submitted an assessment of this place yet.</p>
        ) : (
          <ul className="divide-y rounded-lg border text-sm">
            {details.submissions.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center gap-2 px-4 py-2">
                <Link href={`/dashboard/review/${s.id}`} prefetch={false} className="font-medium underline-offset-4 hover:underline">
                  {s.kind === "update" ? "Update" : "First assessment"}
                </Link>
                <Badge variant={s.status === "rejected" ? "destructive" : s.status === "pending" ? "default" : "outline"}>
                  {SUBMISSION_STATUS[s.status]}
                </Badge>
                <span className="text-muted-foreground">
                  by {s.submittedBy} on {formatDate(s.submittedAt)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {isAdmin && (
        <section aria-labelledby="delete-heading" className="space-y-2 border-t pt-6">
          <h2 id="delete-heading" className="text-lg font-semibold">
            Delete
          </h2>
          {cantDelete ? (
            <p className="text-sm text-muted-foreground">{cantDelete}</p>
          ) : (
            <DeletePlaceForm placeId={place.id} placeName={place.name} />
          )}
        </section>
      )}
    </div>
  );
}
