"use client";

// "Delete place" with a second step to confirm, instead of a browser pop-up
// (pop-ups are awkward with screen readers and easy to click through).

import { useActionState, useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { removePlace, type PlaceFormState } from "../actions";

export function DeletePlaceForm({ placeId, placeName }: { placeId: string; placeName: string }) {
  const [state, action, deleting] = useActionState<PlaceFormState, FormData>(removePlace, null);
  const [confirming, setConfirming] = useState(false);

  if (!confirming) {
    return (
      <Button variant="outline" onClick={() => setConfirming(true)}>
        Delete place…
      </Button>
    );
  }

  return (
    <form action={action} className="space-y-2 rounded-lg border border-destructive/50 p-4">
      <input type="hidden" name="placeId" value={placeId} />
      <p className="text-sm">
        Delete <strong>{placeName}</strong> for good? Use this only for a place added by mistake. The change history keeps a
        record of it.
      </p>
      {state?.error && (
        <Alert variant="destructive" role="alert">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}
      <div className="flex gap-2">
        <Button type="submit" variant="destructive" disabled={deleting}>
          {deleting ? "Deleting…" : "Yes, delete it"}
        </Button>
        <Button type="button" variant="outline" onClick={() => setConfirming(false)}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
