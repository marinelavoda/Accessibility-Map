// Checks what an admin typed into the "Add a place" / "Edit place" form.
// No imports, so the tests can load it directly.

export type PlaceInput = {
  name: string;
  otherNames: string[] | null;
  categoryId: string;
  lat: number;
  lng: number;
  address: string | null;
};

export type PlaceInputResult = { ok: true; value: PlaceInput } | { ok: false; errors: Record<string, string> };

/** Roughly Moldova. Catches typos and swapped latitude/longitude, not "wrong street". */
export const AREA = { minLat: 45.4, maxLat: 48.5, minLng: 26.6, maxLng: 30.2 };

const MAX_NAME = 200;
const MAX_ADDRESS = 300;
const MAX_OTHER_NAMES = 10;

/** Reads the form fields. `categoryIds` are the categories that exist. */
export function parsePlaceInput(fields: Record<string, unknown>, categoryIds: string[]): PlaceInputResult {
  const errors: Record<string, string> = {};
  const text = (key: string) => (typeof fields[key] === "string" ? (fields[key] as string).trim() : "");

  const name = text("name");
  if (!name) errors.name = "Enter the place's name.";
  else if (name.length > MAX_NAME) errors.name = `Keep the name under ${MAX_NAME} characters.`;

  // One name per line; blank lines, duplicates and the main name itself are dropped.
  const otherNames = [...new Set(text("otherNames").split("\n").map((n) => n.trim()).filter(Boolean))].filter(
    (n) => n !== name,
  );
  if (otherNames.length > MAX_OTHER_NAMES) errors.otherNames = `At most ${MAX_OTHER_NAMES} other names.`;
  else if (otherNames.some((n) => n.length > MAX_NAME)) errors.otherNames = `Keep each name under ${MAX_NAME} characters.`;

  const categoryId = text("categoryId");
  if (!categoryIds.includes(categoryId)) errors.categoryId = "Choose a category.";

  const lat = parseCoordinate(text("lat"));
  const lng = parseCoordinate(text("lng"));
  if (lat === null || lng === null) {
    errors.location = "Enter the latitude and longitude as numbers, e.g. 47.0262 and 28.8355.";
  } else if (lat < AREA.minLat || lat > AREA.maxLat || lng < AREA.minLng || lng > AREA.maxLng) {
    errors.location = "This location is outside Moldova. Check the numbers (latitude comes first, about 47).";
  }

  const address = text("address");
  if (address.length > MAX_ADDRESS) errors.address = `Keep the address under ${MAX_ADDRESS} characters.`;

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return {
    ok: true,
    value: {
      name,
      otherNames: otherNames.length > 0 ? otherNames : null,
      categoryId,
      lat: lat!,
      lng: lng!,
      address: address || null,
    },
  };
}

/** "47.0262" or "47,0262" (Romanian decimal comma) -> 47.0262; anything else -> null. */
function parseCoordinate(value: string): number | null {
  const normalized = value.replace(",", ".");
  if (!/^-?\d{1,3}(\.\d+)?$/.test(normalized)) return null;
  return Number(normalized);
}

/** The fields of `after` that differ from `before`, as { old, new } for the change log. */
export function changedFields<T extends Record<string, unknown>>(before: T, after: Partial<T>) {
  const oldRow: Record<string, unknown> = {};
  const newRow: Record<string, unknown> = {};
  for (const key of Object.keys(after) as (keyof T & string)[]) {
    if (JSON.stringify(before[key] ?? null) !== JSON.stringify(after[key] ?? null)) {
      oldRow[key] = before[key] ?? null;
      newRow[key] = after[key] ?? null;
    }
  }
  return { oldRow, newRow, changed: Object.keys(newRow).length > 0 };
}

/** Roughly 100 m around a point, for the "is it already here?" check. */
export function nearbyBox(lat: number, lng: number) {
  return { minLat: lat - 0.0009, maxLat: lat + 0.0009, minLng: lng - 0.0013, maxLng: lng + 0.0013 };
}

/** Why a place can't be deleted, or null if it can. The place page uses it to hide the button. */
export function whyNotDeletable(source: "osm" | "admin", assessmentCount: number): string | null {
  if (assessmentCount > 0) return "This place has assessments, so it can't be deleted. Hide it instead: its history is kept.";
  if (source === "osm") return "This place comes from OpenStreetMap and the next import would add it back. Hide it instead.";
  return null;
}
