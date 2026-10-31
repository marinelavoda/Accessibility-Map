// Reads the Places list's search box, filters and page number from the address bar
// (?q=farmacie&level=unrated&page=2), and turns the search words into a safe query for
// the place_search index. No imports, so the tests can load it directly.

export const PAGE_SIZE = 50;

export const LEVEL_FILTERS = {
  accessible: "Accessible",
  partial: "Partially accessible",
  inaccessible: "Inaccessible",
  unrated: "Not yet rated",
} as const;

export const STATUS_FILTERS = {
  active: "Shown in the app",
  hidden: "Hidden",
  gone_from_osm: "Gone from OpenStreetMap",
} as const;

export const SORTS = {
  overdue: "Longest since last verified",
  name: "Name (A–Z)",
  newest: "Recently added",
} as const;

export type PlaceFilters = {
  q: string;
  category: string | null;
  level: keyof typeof LEVEL_FILTERS | null;
  status: keyof typeof STATUS_FILTERS | null;
  sort: keyof typeof SORTS;
  page: number; // 1, 2, 3 ...
};

type SearchParams = Record<string, string | string[] | undefined>;

/** Anything unexpected in the address bar is ignored rather than causing an error. */
export function parsePlaceFilters(params: SearchParams): PlaceFilters {
  const one = (key: string) => {
    const value = params[key];
    return (Array.isArray(value) ? value[0] : value)?.trim() ?? "";
  };
  const pick = <T extends object>(options: T, value: string) => (value in options ? (value as keyof T) : null);

  const page = Number(one("page"));
  return {
    q: one("q").slice(0, 100),
    category: one("category") || null,
    level: pick(LEVEL_FILTERS, one("level")),
    status: pick(STATUS_FILTERS, one("status")),
    sort: pick(SORTS, one("sort")) ?? "overdue",
    page: Number.isInteger(page) && page > 1 ? page : 1,
  };
}

/** The address of the list with some filters changed, e.g. for "Next page". Leaves out defaults. */
export function placeListHref(filters: PlaceFilters, change: Partial<PlaceFilters> = {}): string {
  const f = { ...filters, ...change };
  const params = new URLSearchParams();
  if (f.q) params.set("q", f.q);
  if (f.category) params.set("category", f.category);
  if (f.level) params.set("level", f.level);
  if (f.status) params.set("status", f.status);
  if (f.sort !== "overdue") params.set("sort", f.sort);
  if (f.page > 1) params.set("page", String(f.page));
  const query = params.toString();
  return query ? `/dashboard/places?${query}` : "/dashboard/places";
}

/**
 * Search words -> an FTS5 query: every word must match the start of a word in the name,
 * other names or address. "farm fam" -> "farm"* "fam"*  (finds "Farmacia Familiei");
 * words can mix both: "farmacia stefan" finds a pharmacy on Ștefan cel Mare.
 * Only letters and digits are kept, so quotes or FTS operators (AND, NEAR, *) typed in the
 * box can't break the query. Diacritics are handled by the index itself ("chisinau" finds
 * "Chișinău"). Returns null when there's nothing to search for.
 */
export function toSearchQuery(q: string): string | null {
  const words = q
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean)
    .slice(0, 8);
  return words.length > 0 ? words.map((w) => `"${w}"*`).join(" ") : null;
}
