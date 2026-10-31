import Link from "next/link";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDate } from "@/lib/format";
import {
  LEVEL_FILTERS,
  PAGE_SIZE,
  SORTS,
  STATUS_FILTERS,
  parsePlaceFilters,
  placeListHref,
} from "@/lib/place-filters";
import { LEVEL_LABELS } from "@/lib/scoring";
import { listPlaces } from "@/server/dashboard";
import { listCategories } from "@/server/places-admin";
import { requireRole } from "@/server/require-role";
import { hasRole } from "@/server/roles";

const STATUS_LABEL = { active: "Active", hidden: "Hidden", gone_from_osm: "Gone from OSM" };
const selectClass = "h-8 w-full rounded-lg border border-input bg-transparent px-2 text-sm";

// Every place, with search, filters and 50 per page. The filters are a plain GET form, so
// they live in the address bar: a filtered list can be bookmarked or sent to a colleague.
// Reviewers can look; admins also get "Add a missing place" and, on each place's page,
// edit / hide / delete.
export default async function PlacesPage({ searchParams }: PageProps<"/dashboard/places">) {
  const user = await requireRole("reviewer");
  const params = await searchParams;
  const filters = parsePlaceFilters(params);
  const [{ rows, total }, categories] = await Promise.all([listPlaces(filters), listCategories()]);

  const first = (filters.page - 1) * PAGE_SIZE + 1;
  const last = first + rows.length - 1;
  const lastPage = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const hasFilters = Boolean(filters.q || filters.category || filters.level || filters.status);

  return (
    <div className="space-y-6">
      {params.deleted === "1" && (
        <Alert role="status">
          <AlertDescription>Place deleted. The change history keeps a record of it.</AlertDescription>
        </Alert>
      )}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Places</h1>
          <p className="text-muted-foreground">Every place, including hidden ones.</p>
        </div>
        {hasRole(user.role, "admin") && (
          <Button nativeButton={false} render={<Link href="/dashboard/places/new" />}>
            Add a missing place
          </Button>
        )}
      </div>

      <form method="get" role="search" aria-label="Search and filter places" className="space-y-3 rounded-lg border p-4">
        <div className="space-y-1">
          <Label htmlFor="q">Search by name or address</Label>
          <Input
            id="q"
            name="q"
            type="search"
            defaultValue={filters.q}
            placeholder="e.g. farmacia, or stefan cel mare 83 (diacritics optional)"
          />
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-1">
            <Label htmlFor="category">Category</Label>
            <select id="category" name="category" defaultValue={filters.category ?? ""} className={selectClass}>
              <option value="">All categories</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name.en}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="level">Level on the map</Label>
            <select id="level" name="level" defaultValue={filters.level ?? ""} className={selectClass}>
              <option value="">Any level</option>
              {Object.entries(LEVEL_FILTERS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="status">Status</Label>
            <select id="status" name="status" defaultValue={filters.status ?? ""} className={selectClass}>
              <option value="">Any status</option>
              {Object.entries(STATUS_FILTERS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="sort">Sort by</Label>
            <select id="sort" name="sort" defaultValue={filters.sort} className={selectClass}>
              {Object.entries(SORTS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="flex gap-2">
          <Button type="submit">Search</Button>
          {hasFilters && (
            <Button nativeButton={false} variant="outline" render={<Link href={placeListHref({ ...filters, q: "", category: null, level: null, status: null, page: 1 })} />}>
              Clear filters
            </Button>
          )}
        </div>
      </form>

      <p role="status" className="text-sm text-muted-foreground">
        {total === 0
          ? "No places match."
          : rows.length === 0
            ? `There are only ${total} matching places; this page is past the end.`
            : `Showing ${first}–${last} of ${total} place${total === 1 ? "" : "s"}${hasFilters ? " that match" : ""}.`}
      </p>

      {rows.length > 0 && (
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Level on the map</TableHead>
                <TableHead>Last verified</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Source</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="font-medium">
                    <Link href={`/dashboard/places/${p.id}`} className="underline underline-offset-4">
                      {p.name}
                    </Link>
                  </TableCell>
                  <TableCell>{p.category.en}</TableCell>
                  <TableCell>
                    {p.level ? LEVEL_LABELS[p.level] : <span className="text-muted-foreground">Not yet rated</span>}
                  </TableCell>
                  <TableCell>{formatDate(p.lastVerifiedAt)}</TableCell>
                  <TableCell>
                    <Badge variant={p.status === "active" ? "outline" : "destructive"}>{STATUS_LABEL[p.status]}</Badge>
                  </TableCell>
                  <TableCell>{p.source === "osm" ? "OpenStreetMap" : "Added by admin"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {(filters.page > 1 || (rows.length > 0 && last < total)) && (
        <nav aria-label="Pages" className="flex items-center gap-2">
          {filters.page > 1 && (
            <Button nativeButton={false} variant="outline" render={<Link href={placeListHref(filters, { page: Math.min(filters.page - 1, lastPage) })} />}>
              Previous page
            </Button>
          )}
          <span className="text-sm text-muted-foreground">
            Page {filters.page} of {lastPage}
          </span>
          {rows.length > 0 && last < total && (
            <Button nativeButton={false} variant="outline" render={<Link href={placeListHref(filters, { page: filters.page + 1 })} />}>
              Next page
            </Button>
          )}
        </nav>
      )}
    </div>
  );
}
