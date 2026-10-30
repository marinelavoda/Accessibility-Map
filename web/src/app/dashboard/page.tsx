import Link from "next/link";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getOverviewCounts } from "@/server/dashboard";
import { requireRole } from "@/server/require-role";

export default async function OverviewPage() {
  const user = await requireRole("reviewer");
  const counts = await getOverviewCounts();

  const tiles = [
    { label: "Submissions waiting for review", value: counts.pendingSubmissions, href: "/dashboard/review" },
    { label: "Rated places (shown on the map)", value: counts.ratedPlaces, href: "/dashboard/places" },
    { label: "Active places", value: counts.activePlaces, href: "/dashboard/places" },
    { label: "Hidden places", value: counts.hiddenPlaces, href: "/dashboard/places" },
    { label: "Reviewers and admins", value: counts.staff, href: user.role === "admin" ? "/dashboard/users" : null },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Overview</h1>
        <p className="text-muted-foreground">Welcome, {user.name}.</p>
      </div>
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {tiles.map((tile) => (
          <li key={tile.label}>
            <Card>
              <CardHeader>
                <CardDescription>
                  {tile.href ? (
                    <Link href={tile.href} className="underline-offset-4 hover:underline">
                      {tile.label}
                    </Link>
                  ) : (
                    tile.label
                  )}
                </CardDescription>
                <CardTitle className="text-3xl tabular-nums">{tile.value}</CardTitle>
              </CardHeader>
            </Card>
          </li>
        ))}
      </ul>
    </div>
  );
}
