import Link from "next/link";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDate } from "@/lib/format";
import { listAllPlaces } from "@/server/dashboard";
import { requireRole } from "@/server/require-role";
import { hasRole } from "@/server/roles";

const LEVEL_LABEL = { accessible: "Accessible", partial: "Partially accessible", inaccessible: "Inaccessible" };
const STATUS_LABEL = { active: "Active", hidden: "Hidden", gone_from_osm: "Gone from OSM" };

// Every place. Reviewers can look; admins also get "Add a missing place" and, on each
// place's page, edit / hide / delete.
export default async function PlacesPage({ searchParams }: PageProps<"/dashboard/places">) {
  const user = await requireRole("reviewer");
  const { deleted } = await searchParams;
  const allPlaces = await listAllPlaces();

  return (
    <div className="space-y-6">
      {deleted === "1" && (
        <Alert role="status">
          <AlertDescription>Place deleted. The change history keeps a record of it.</AlertDescription>
        </Alert>
      )}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Places</h1>
          <p className="text-muted-foreground">
            All {allPlaces.length} places, including hidden ones. Longest since last verification first.
          </p>
        </div>
        {hasRole(user.role, "admin") && (
          <Button nativeButton={false} render={<Link href="/dashboard/places/new" />}>
            Add a missing place
          </Button>
        )}
      </div>
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
            {allPlaces.map((p) => (
              <TableRow key={p.id}>
                <TableCell className="font-medium">
                  <Link href={`/dashboard/places/${p.id}`} className="underline underline-offset-4">
                    {p.name}
                  </Link>
                </TableCell>
                <TableCell>{p.category.en}</TableCell>
                <TableCell>{p.level ? LEVEL_LABEL[p.level] : <span className="text-muted-foreground">Not yet rated</span>}</TableCell>
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
    </div>
  );
}
