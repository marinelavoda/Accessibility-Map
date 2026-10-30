// GET /api/export/places (or answers, submissions, ...) -> a CSV file download. Admins only.

import { toCsv } from "@/server/csv";
import { EXPORTS, isExportName } from "@/server/export";
import { requireRoleForApi } from "@/server/require-role";

export async function GET(_request: Request, { params }: RouteContext<"/api/export/[dataset]">) {
  const access = await requireRoleForApi("admin"); // hard rule 1: first line
  if (access instanceof Response) return access;

  const { dataset } = await params;
  if (!isExportName(dataset)) return Response.json({ error: "Unknown export." }, { status: 404 });

  const { headers, rows } = await EXPORTS[dataset].load();
  const date = new Date().toISOString().slice(0, 10);
  return new Response(toCsv(headers, rows), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="harta-${dataset}-${date}.csv"`,
      "Cache-Control": "no-store", // never keep a copy in a browser or proxy cache
    },
  });
}
