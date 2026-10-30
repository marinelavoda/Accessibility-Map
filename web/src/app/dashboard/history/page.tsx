import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { describeChange } from "@/lib/change-diff";
import { getPlaceName, HISTORY_TABLES, listChangers, listChanges, type HistoryFilters } from "@/server/history";
import { requireRole } from "@/server/require-role";

const ACTION_LABEL = { insert: "Added", update: "Changed", delete: "Deleted" };

// Change history (PRD R26): every change, who made it and when. Admins only.
// The filters are a plain form that puts them in the address (?table=places&by=...),
// so a filtered view can be bookmarked or sent to a colleague.
export default async function HistoryPage({ searchParams }: PageProps<"/dashboard/history">) {
  await requireRole("admin");

  const params = await searchParams;
  const one = (key: string) => (typeof params[key] === "string" ? params[key] : undefined);
  const filters: HistoryFilters = {
    table: one("table"),
    by: one("by"),
    place: one("place"),
    before: Number(one("before")) || undefined,
  };

  const [{ changes, hasOlder }, changers, placeName] = await Promise.all([
    listChanges(filters),
    listChangers(),
    filters.place ? getPlaceName(filters.place) : null,
  ]);

  /** The current address with some filters changed (undefined removes one). */
  const withFilters = (changed: Partial<Record<keyof HistoryFilters, string | undefined>>) => {
    const next = new URLSearchParams();
    for (const [key, value] of Object.entries({ ...filters, before: undefined, ...changed })) {
      if (value) next.set(key, String(value));
    }
    return `/dashboard/history${next.size ? `?${next}` : ""}`;
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Change history</h1>
        <p className="text-muted-foreground">Every change to the data, newest first. Only admins can see this page.</p>
      </div>

      <form method="get" className="flex flex-wrap items-end gap-3">
        {filters.place && <input type="hidden" name="place" value={filters.place} />}
        <label className="grid gap-1 text-sm">
          What changed
          <select name="table" defaultValue={filters.table ?? ""} className="h-8 rounded-lg border border-input bg-transparent px-2">
            <option value="">Everything</option>
            {Object.entries(HISTORY_TABLES).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-sm">
          Changed by
          <select name="by" defaultValue={filters.by ?? ""} className="h-8 rounded-lg border border-input bg-transparent px-2">
            <option value="">Anyone</option>
            <option value="system">System (imports, scripts)</option>
            {changers.map((person) => (
              <option key={person.id} value={person.id}>
                {person.name}
              </option>
            ))}
          </select>
        </label>
        <Button type="submit" size="sm">
          Filter
        </Button>
        {(filters.table || filters.by || filters.place) && (
          <Link href="/dashboard/history" className="text-sm underline">
            Clear filters
          </Link>
        )}
      </form>

      {filters.place && (
        <p className="text-sm">
          Showing changes for <strong>{placeName ?? "an unknown place"}</strong> only.{" "}
          <Link href={withFilters({ place: undefined })} className="underline">
            Show all places
          </Link>
        </p>
      )}

      <div className="overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>When</TableHead>
              <TableHead>Who</TableHead>
              <TableHead>What</TableHead>
              <TableHead>About</TableHead>
              <TableHead>Change</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {changes.map((c) => {
              const fields = describeChange(c.oldRow, c.newRow);
              return (
                <TableRow key={c.id} className="align-top">
                  <TableCell className="whitespace-nowrap">
                    {c.changedAt.toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Chisinau" })}
                  </TableCell>
                  <TableCell>
                    {!c.changedById ? (
                      <span className="text-muted-foreground">System</span>
                    ) : c.changedByDeleted ? (
                      <span className="text-muted-foreground">Former user</span>
                    ) : (
                      c.changedByName
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">
                      {ACTION_LABEL[c.action]} · {HISTORY_TABLES[c.tableName as keyof typeof HISTORY_TABLES] ?? c.tableName}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {c.placeId ? (
                      <Link href={withFilters({ place: c.placeId })} className="underline-offset-4 hover:underline">
                        {c.placeName}
                      </Link>
                    ) : c.userName ? (
                      c.userName
                    ) : (
                      <span className="font-mono text-xs text-muted-foreground">{c.recordId}</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {fields.length === 0 ? (
                      <span className="text-muted-foreground">—</span>
                    ) : (
                      <ul className="space-y-0.5 text-sm">
                        {fields.map((f) => (
                          <li key={f.field}>
                            <span className="text-muted-foreground">{f.field}:</span>{" "}
                            {f.from !== null && (
                              <>
                                <del className="text-muted-foreground">{f.from}</del> →{" "}
                              </>
                            )}
                            {f.to ?? <span className="text-muted-foreground">removed</span>}
                          </li>
                        ))}
                      </ul>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
            {changes.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground">
                  No changes match these filters.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {(filters.before || hasOlder) && (
        <nav aria-label="More changes" className="flex gap-4 text-sm">
          {filters.before && (
            <Link href={withFilters({})} className="underline">
              Back to newest
            </Link>
          )}
          {hasOlder && (
            <Link href={withFilters({ before: String(changes.at(-1)!.id) })} className="underline">
              Older changes
            </Link>
          )}
        </nav>
      )}
    </div>
  );
}
