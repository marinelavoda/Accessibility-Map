"use server";

// Server actions for managing places. Every one starts with requireRole("admin") (hard rule 1):
// anyone can send a request to a server action, so the check here is what counts,
// not the fact that only admins see the buttons.

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { parsePlaceInput } from "@/lib/place-input";
import { searchAddress, type AddressCandidate } from "@/server/nominatim";
import {
  PlaceError,
  createPlace,
  deletePlace,
  findNearbyPlaces,
  listCategories,
  setPlaceStatus,
  updatePlace,
} from "@/server/places-admin";
import { requireRole } from "@/server/require-role";

export type NearbyPlace = { id: string; name: string; address: string | null; status: string };
export type PlaceFormState = {
  error?: string;
  fieldErrors?: Record<string, string>;
  /** Places already within ~100 m: the admin must confirm theirs is a different one. */
  nearby?: NearbyPlace[];
} | null;

/** "Find" button: looks up an address or place name in Chișinău. */
export async function lookupAddress(query: string): Promise<{ candidates: AddressCandidate[] } | { error: string }> {
  await requireRole("admin");
  const q = query.trim();
  if (q.length < 3) return { error: "Type at least 3 characters." };
  if (q.length > 200) return { error: "That's too long to search for." };
  try {
    const candidates = await searchAddress(q);
    return candidates.length > 0 ? { candidates } : { error: "Nothing found in Chișinău. Try the street and number only." };
  } catch (error) {
    console.error("Address lookup failed", error);
    return { error: "The address search isn't answering right now. You can type the location by hand." };
  }
}

/** "Add place" and "Save changes". With a placeId it edits that place, otherwise it adds one. */
export async function savePlace(_previous: PlaceFormState, form: FormData): Promise<PlaceFormState> {
  const admin = await requireRole("admin");
  const categoryIds = (await listCategories()).map((c) => c.id);
  const parsed = parsePlaceInput(Object.fromEntries(form), categoryIds);
  if (!parsed.ok) return { error: "Check the highlighted fields.", fieldErrors: parsed.errors };
  const input = parsed.value;

  const placeId = form.get("placeId");
  let savedId: string;
  try {
    if (typeof placeId === "string" && placeId) {
      const version = Number(form.get("version"));
      await updatePlace(admin, placeId, input, version);
      savedId = placeId;
    } else {
      // Most missing places are really already in the database under another name.
      if (form.get("confirmNotNearby") !== "yes") {
        const nearby = await findNearbyPlaces(input.lat, input.lng);
        if (nearby.length > 0) return { nearby };
      }
      savedId = await createPlace(admin, input);
    }
  } catch (error) {
    if (error instanceof PlaceError) return { error: error.message };
    throw error;
  }

  revalidatePath("/dashboard/places");
  redirect(`/dashboard/places/${savedId}?saved=1`);
}

/** "Hide from the app" and "Show in the app again". */
export async function changePlaceStatus(form: FormData) {
  const admin = await requireRole("admin");
  const placeId = String(form.get("placeId"));
  const status = form.get("status");
  if (status !== "active" && status !== "hidden") return;
  try {
    await setPlaceStatus(admin, placeId, status);
  } catch (error) {
    if (!(error instanceof PlaceError)) throw error;
    redirect(`/dashboard/places/${placeId}?error=changed`);
  }
  revalidatePath(`/dashboard/places/${placeId}`);
  redirect(`/dashboard/places/${placeId}?saved=${status}`);
}

export async function removePlace(_previous: PlaceFormState, form: FormData): Promise<PlaceFormState> {
  const admin = await requireRole("admin");
  const placeId = String(form.get("placeId"));
  try {
    await deletePlace(admin, placeId);
  } catch (error) {
    if (error instanceof PlaceError) return { error: error.message };
    throw error;
  }
  revalidatePath("/dashboard/places");
  redirect("/dashboard/places?deleted=1");
}
