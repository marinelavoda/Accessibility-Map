import Link from "next/link";
import { listPublicPlaces, type PublicCriterion, type PublicPlace } from "@/server/public-places";

// Read the database on every request instead of building the page once at deploy time.
export const dynamic = "force-dynamic";

const LEVEL_STYLE: Record<NonNullable<PublicPlace["level"]>, { label: string; className: string }> = {
  accessible: { label: "Accessible", className: "bg-green-100 text-green-900 ring-green-600/30" },
  partial: { label: "Partially accessible", className: "bg-amber-100 text-amber-900 ring-amber-600/30" },
  inaccessible: { label: "Inaccessible", className: "bg-red-100 text-red-900 ring-red-600/30" },
};

const CRITERION_MARK: Record<PublicCriterion["level"], { mark: string; label: string; className: string }> = {
  accessible: { mark: "✓", label: "OK", className: "text-green-700" },
  partial: { mark: "~", label: "Partly", className: "text-amber-700" },
  inaccessible: { mark: "✗", label: "Barrier", className: "text-red-700" },
  not_applicable: { mark: "–", label: "Not applicable", className: "text-zinc-500" },
};

export default async function Home() {
  const allPlaces = await listPublicPlaces();
  const rated = allPlaces.filter((p) => p.level);
  const unrated = allPlaces.filter((p) => !p.level);

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-10 font-sans">
      <header className="mb-6 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Harta Accesibilității</h1>
          <p className="mt-1 text-zinc-600">Verified accessibility information for places in Chișinău.</p>
        </div>
        <Link href="/dashboard" className="text-sm text-zinc-600 underline">
          Staff sign-in
        </Link>
      </header>

      <p role="note" className="mb-8 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
        <strong>Sample data for testing.</strong> The places are real, but every rating below is invented and is
        not a real assessment by MOTIVAȚIE.
      </p>

      <section aria-labelledby="rated-heading" className="mb-10">
        <h2 id="rated-heading" className="mb-4 text-xl font-semibold">
          Rated places ({rated.length})
        </h2>
        <ul className="space-y-4">
          {rated.map((place) => (
            <li key={place.id}>
              <RatedPlace place={place} />
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="unrated-heading">
        <h2 id="unrated-heading" className="mb-1 text-xl font-semibold">
          Not yet rated ({unrated.length})
        </h2>
        <p className="mb-4 text-sm text-zinc-600">No verified assessment has been published for these places yet.</p>
        <ul className="divide-y divide-zinc-200 rounded-lg border border-zinc-200">
          {unrated.map((place) => (
            <li key={place.id} className="flex flex-wrap items-baseline justify-between gap-2 px-4 py-3">
              <span className="font-medium">{place.name}</span>
              <span className="text-sm text-zinc-500">{place.category.en}</span>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}

function RatedPlace({ place }: { place: PublicPlace }) {
  const level = LEVEL_STYLE[place.level!];
  return (
    <article className="rounded-lg border border-zinc-200 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-lg font-semibold">{place.name}</h3>
          <p className="text-sm text-zinc-500">
            {place.category.en}
            {place.address ? ` · ${place.address}` : ""}
          </p>
        </div>
        <span className={`rounded-full px-3 py-1 text-sm font-medium ring-1 ring-inset ${level.className}`}>
          {level.label}
        </span>
      </div>

      <ul className="mt-4 space-y-2 text-sm">
        {place.criteria.map((c) => {
          const mark = CRITERION_MARK[c.level];
          return (
            <li key={c.name.en} className="flex gap-2">
              <span aria-hidden className={`w-4 shrink-0 font-bold ${mark.className}`}>
                {mark.mark}
              </span>
              <span>
                <span className="font-medium">{c.name.en}:</span> {c.answer ? c.answer.en : mark.label}
                <span className="sr-only"> ({mark.label})</span>
                {c.details.length > 0 && <span className="text-zinc-600"> — {c.details.map((d) => d.en).join(", ")}</span>}
                {c.notes && <span className="block text-zinc-500 italic">“{c.notes}”</span>}
              </span>
            </li>
          );
        })}
      </ul>

      <p className="mt-4 text-xs text-zinc-500">
        {place.hasDesignatedParking === false && "No designated parking · "}
        {place.lastVerifiedAt && `Last verified ${place.lastVerifiedAt.toLocaleDateString("en-GB", { dateStyle: "long" })}`}
      </p>
    </article>
  );
}
