import { Download } from "lucide-react";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EXPORTS } from "@/server/export";
import { requireRole } from "@/server/require-role";

// Export (PRD R30). Each link downloads one CSV file; the download itself is checked
// again by the API route, so a copied link doesn't work for anyone who isn't an admin.
export default async function ExportPage() {
  await requireRole("admin");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Export data</h1>
        <p className="max-w-prose text-muted-foreground">
          Download the data as CSV files, which open in Excel and Google Sheets. Files include pending, rejected and
          hidden data. People appear only as user IDs, never names or emails.
        </p>
      </div>
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Object.entries(EXPORTS).map(([name, item]) => (
          <li key={name}>
            <Card>
              <CardHeader>
                <CardTitle>
                  {/* A plain <a>, not Next's <Link>: this is a file download, not a page. */}
                  <a href={`/api/export/${name}`} download className="inline-flex items-center gap-2 underline-offset-4 hover:underline">
                    <Download aria-hidden className="size-4" />
                    {item.title} (CSV)
                  </a>
                </CardTitle>
                <CardDescription>{item.description}</CardDescription>
              </CardHeader>
            </Card>
          </li>
        ))}
      </ul>
    </div>
  );
}
