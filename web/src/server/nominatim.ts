// Address lookup for admins adding a place (Nominatim, OpenStreetMap's search service).
// Nominatim's usage policy: identify the app in the User-Agent, at most 1 request per
// second, and no search-as-you-type. The form only searches when the admin presses
// "Find", which keeps us far below the limit.
// No imports, so the tests can load it directly.

const ENDPOINT = "https://nominatim.openstreetmap.org/search";
const USER_AGENT = "harta-accesibilitatii-dashboard/1.0 (+https://accessibility-map.accessibility-map.workers.dev)";
/** Chișinău and the towns around it (left, top, right, bottom). */
const VIEWBOX = "28.70,47.10,29.00,46.93";

export type AddressCandidate = {
  label: string; // the full text Nominatim returns, shown in the list
  name: string | null; // e.g. "Primăria Municipiului Chișinău"
  address: string | null; // short form saved on the place, e.g. "Bulevardul Ștefan cel Mare și Sfânt 83"
  lat: number;
  lng: number;
};

type NominatimResult = {
  lat: string;
  lon: string;
  name?: string;
  display_name: string;
  address?: Record<string, string>;
};

export async function searchAddress(query: string): Promise<AddressCandidate[]> {
  const params = new URLSearchParams({
    q: query,
    format: "jsonv2",
    addressdetails: "1",
    limit: "5",
    countrycodes: "md",
    viewbox: VIEWBOX,
    bounded: "1",
    "accept-language": "ro",
  });
  const response = await fetch(`${ENDPOINT}?${params}`, {
    headers: { "User-Agent": USER_AGENT },
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) throw new Error(`Nominatim answered ${response.status}`);
  return ((await response.json()) as NominatimResult[]).map(toCandidate);
}

export function toCandidate(result: NominatimResult): AddressCandidate {
  const a = result.address ?? {};
  const street = a.road ?? a.pedestrian ?? a.square ?? null;
  const address = street ? [street, a.house_number].filter(Boolean).join(" ") : null;
  return {
    label: result.display_name,
    name: result.name || null,
    address,
    lat: Number(Number(result.lat).toFixed(6)),
    lng: Number(Number(result.lon).toFixed(6)),
  };
}
