"use client";

// The "Add a place" / "Edit place" form (admins). The address search fills in the
// location and address; the admin can also type them by hand.

import Link from "next/link";
import { startTransition, useActionState, useState, useTransition } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { AddressCandidate } from "@/server/nominatim";
import { lookupAddress, savePlace, type PlaceFormState } from "./actions";

export type PlaceFormValues = {
  name: string;
  otherNames: string; // one per line
  categoryId: string;
  lat: string;
  lng: string;
  address: string;
};

type Props = {
  categories: { id: string; name: string }[];
  initial: PlaceFormValues;
  /** Set when editing: the place and its updated_at, so a parallel edit isn't overwritten. */
  edit?: { placeId: string; version: number; fromOsm: boolean };
};

export function PlaceForm({ categories, initial, edit }: Props) {
  const [state, action, saving] = useActionState<PlaceFormState, FormData>(savePlace, null);
  const [values, setValues] = useState(initial);
  const set = (field: keyof PlaceFormValues) => (e: { target: { value: string } }) =>
    setValues((v) => ({ ...v, [field]: e.target.value }));

  const [query, setQuery] = useState("");
  const [candidates, setCandidates] = useState<AddressCandidate[]>([]);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [searching, startSearch] = useTransition();

  function find() {
    startSearch(async () => {
      const result = await lookupAddress(query);
      if ("error" in result) {
        setLookupError(result.error);
        setCandidates([]);
      } else {
        setLookupError(null);
        setCandidates(result.candidates);
      }
    });
  }

  function choose(c: AddressCandidate) {
    setValues((v) => ({
      ...v,
      name: v.name || c.name || "",
      lat: String(c.lat),
      lng: String(c.lng),
      address: c.address ?? v.address,
    }));
    setCandidates([]);
  }

  const fieldError = (field: string) => state?.fieldErrors?.[field];
  const lat = Number(values.lat.replace(",", "."));
  const lng = Number(values.lng.replace(",", "."));
  const hasLocation = values.lat !== "" && values.lng !== "" && Number.isFinite(lat) && Number.isFinite(lng);

  return (
    <div className="max-w-2xl space-y-6">
      {/* Address search: its own small form so Enter searches instead of saving the place. */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          find();
        }}
        className="space-y-2 rounded-lg border p-4"
      >
        <Label htmlFor="lookup">Find the location</Label>
        <p className="text-sm text-muted-foreground">
          Search OpenStreetMap for an address or place name in Chișinău, then pick the right result. It fills in the
          location and address below.
        </p>
        <div className="flex gap-2">
          <Input
            id="lookup"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="e.g. Ștefan cel Mare 83"
          />
          <Button type="submit" variant="outline" disabled={searching}>
            {searching ? "Searching…" : "Find"}
          </Button>
        </div>
        <p role="status" className="text-sm text-destructive">
          {lookupError}
        </p>
        {candidates.length > 0 && (
          <ul className="divide-y rounded-lg border text-sm" aria-label="Search results">
            {candidates.map((c) => (
              <li key={`${c.lat},${c.lng},${c.label}`}>
                <button type="button" onClick={() => choose(c)} className="w-full px-3 py-2 text-left hover:bg-muted">
                  {c.label}
                </button>
              </li>
            ))}
          </ul>
        )}
      </form>

      {/* Sent with onSubmit instead of action={...}: React resets a form after its action runs,
          and that reset would jump the Category list back to "Choose a category" whenever
          the server answers with an error or the "is it one of these?" question. */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const data = new FormData(e.currentTarget);
          startTransition(() => action(data));
        }}
        className="space-y-4"
      >
        {edit && (
          <>
            <input type="hidden" name="placeId" value={edit.placeId} />
            <input type="hidden" name="version" value={edit.version} />
          </>
        )}

        {edit?.fromOsm && (
          <Alert>
            <AlertDescription>
              This place comes from OpenStreetMap. If its name or location is wrong there too, consider fixing it on
              openstreetmap.org as well, so everyone&apos;s maps get the correction.
            </AlertDescription>
          </Alert>
        )}

        <Field label="Name" id="name" error={fieldError("name")}>
          <Input id="name" name="name" value={values.name} onChange={set("name")} required aria-invalid={!!fieldError("name")} />
        </Field>

        <Field
          label="Other names (optional)"
          id="otherNames"
          hint="One per line: old names, names in Russian, what people call it. Search finds these too."
          error={fieldError("otherNames")}
        >
          <textarea
            id="otherNames"
            name="otherNames"
            value={values.otherNames}
            onChange={set("otherNames")}
            rows={2}
            aria-invalid={!!fieldError("otherNames")}
            className="w-full rounded-lg border border-input bg-transparent px-2.5 py-1.5 text-sm"
          />
        </Field>

        <Field label="Category" id="categoryId" error={fieldError("categoryId")}>
          <select
            id="categoryId"
            name="categoryId"
            value={values.categoryId}
            onChange={set("categoryId")}
            required
            aria-invalid={!!fieldError("categoryId")}
            className="h-8 w-full rounded-lg border border-input bg-transparent px-2 text-sm"
          >
            <option value="" disabled>
              Choose a category
            </option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </Field>

        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">Location</legend>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="lat">Latitude</Label>
              <Input id="lat" name="lat" value={values.lat} onChange={set("lat")} inputMode="decimal" placeholder="47.0262" required aria-invalid={!!fieldError("location")} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="lng">Longitude</Label>
              <Input id="lng" name="lng" value={values.lng} onChange={set("lng")} inputMode="decimal" placeholder="28.8355" required aria-invalid={!!fieldError("location")} />
            </div>
          </div>
          {fieldError("location") && <p className="text-sm text-destructive">{fieldError("location")}</p>}
          {hasLocation && (
            <a
              href={`https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=19/${lat}/${lng}`}
              target="_blank"
              rel="noreferrer"
              className="text-sm underline"
            >
              Check this location on OpenStreetMap (opens in a new tab)
            </a>
          )}
        </fieldset>

        <Field label="Address (optional)" id="address" error={fieldError("address")}>
          <Input id="address" name="address" value={values.address} onChange={set("address")} placeholder="bd. Ștefan cel Mare și Sfânt 83" aria-invalid={!!fieldError("address")} />
        </Field>

        {state?.nearby && (
          <Alert>
            <AlertTitle>Is it one of these?</AlertTitle>
            <AlertDescription className="space-y-2">
              <p>These places are already within about 100 m. If yours is one of them, open it instead of adding it again.</p>
              <ul className="list-disc pl-5">
                {state.nearby.map((p) => (
                  <li key={p.id}>
                    <Link href={`/dashboard/places/${p.id}`} className="underline">
                      {p.name}
                    </Link>
                    {p.address ? `, ${p.address}` : ""}
                    {p.status !== "active" ? ` (${p.status})` : ""}
                  </li>
                ))}
              </ul>
              <label className="flex items-center gap-2">
                <input type="checkbox" name="confirmNotNearby" value="yes" required />
                It&apos;s a different place. Add it.
              </label>
            </AlertDescription>
          </Alert>
        )}

        {state?.error && (
          <Alert variant="destructive" role="alert">
            <AlertDescription>{state.error}</AlertDescription>
          </Alert>
        )}

        <div className="flex gap-2">
          <Button type="submit" disabled={saving}>
            {saving ? "Saving…" : edit ? "Save changes" : "Add place"}
          </Button>
          <Button nativeButton={false} render={<Link href={edit ? `/dashboard/places/${edit.placeId}` : "/dashboard/places"} />} variant="outline">
            Cancel
          </Button>
        </div>
      </form>
    </div>
  );
}

function Field({ label, id, hint, error, children }: { label: string; id: string; hint?: string; error?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label htmlFor={id}>{label}</Label>
      {hint && <p className="text-sm text-muted-foreground">{hint}</p>}
      {children}
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
