import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDate } from "@/lib/format";
import { listAllPlaces } from "@/server/dashboard";
import { requireRole } from "@/server/require-role";

const LEVEL_LABEL = { accessible: "Accessible", partial: "Partially accessible", inaccessible: "Inaccessible" };
const STATUS_LABEL = { active: "Active", hidden: "Hidden", gone_from_osm: "Gone from OSM" };

// Read-only for now. Adding, editing and hiding places (admins) comes in a later step.
export default async function PlacesPage() {
  await requireRole("reviewer");
  const allPlaces = await listAllPlaces();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Places</h1>
        <p className="text-muted-foreground">
          All {allPlaces.length} places, including hidden ones. Longest since last verification first.
        </p>
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
                <TableCell className="font-medium">{p.name}</TableCell>
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
